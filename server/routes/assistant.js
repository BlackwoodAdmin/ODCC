// Ask Open Door — the public AI assistant endpoint.
//
// POST /api/assistant
//   { message, history?, turnstileToken?, chatSessionToken? }
// -> { message, chatSessionToken, crisis? }
//
// Order: rate limit -> validate -> CAPTCHA (session token stands in for the
// single-use Turnstile token) -> mint the session token (on CAPTCHA success,
// independent of the LLM outcome) -> crisis layer (skips the LLM entirely) ->
// LLM, with static keyword fallbacks when the key is missing or OpenAI errors.
import { Router } from 'express';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { buildSystemPrompt } from '../lib/assistant-context.js';
import { getTeachingContext } from '../lib/teaching-documents.js';
import { isCrisisMessage, CRISIS_RESPONSE } from '../lib/crisis-phrases.js';
import { createToken, verifyToken, CHAT_SESSION_PURPOSE } from '../lib/chat-session-token.js';
import { sanitizeChatText } from '../lib/chat-db.js';

const router = Router();

const AI_MODEL = process.env.AI_ASSISTANT_MODEL || 'gpt-4o-mini';
const RATE_LIMIT_MAX = 30;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;

// In-memory per-IP rate limit (single process; resets on restart — fine here).
const rateLimits = new Map();
function rateLimited(ip) {
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const key = `assistant:${ip}:${bucket}`;
  const entry = rateLimits.get(key) || { count: 0 };
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  rateLimits.set(key, entry);
  if (rateLimits.size > 2000) {
    for (const [k] of rateLimits) {
      if (parseInt(k.split(':')[2]) < bucket) rateLimits.delete(k);
    }
  }
  return false;
}

let openaiClient = null;
async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    try {
      const OpenAI = (await import('openai')).default;
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } catch (err) {
      console.error('[Assistant] OpenAI init failed:', err.message);
      return null;
    }
  }
  return openaiClient;
}

router.post('/', async (req, res) => {
  try {
    const ip = req.ip;
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Too many messages. Please slow down and try again in a few minutes.' });
    }

    const { message, history, turnstileToken, chatSessionToken } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` });
    }
    let turns = [];
    if (history !== undefined) {
      if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) {
        return res.status(400).json({ error: 'Invalid history' });
      }
      for (const turn of history) {
        if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') ||
            typeof turn.content !== 'string' || turn.content.length > MAX_TURN_CHARS) {
          return res.status(400).json({ error: 'Invalid history' });
        }
      }
      turns = history.map((t) => ({ role: t.role, content: sanitizeChatText(t.content, MAX_TURN_CHARS) }));
    }

    // CAPTCHA: a valid chat-session token (earned on a previous pass) stands in
    // for a fresh single-use Turnstile token.
    const hasSession = typeof chatSessionToken === 'string' && verifyToken(chatSessionToken, CHAT_SESSION_PURPOSE, ip);
    if (!hasSession) {
      const result = await verifyTurnstile(turnstileToken, ip);
      if (!result.success) {
        return res.status(400).json({ error: result.error, code: result.code, requireCaptcha: true });
      }
    }

    // Minted NOW — on CAPTCHA success, independent of the LLM outcome. The
    // Turnstile token is spent either way; the visitor must get their token.
    const newToken = createToken(CHAT_SESSION_PURPOSE, ip);
    const cleanMessage = sanitizeChatText(message, MAX_MESSAGE_CHARS);

    // Deterministic crisis layer: fixed response, no LLM call at all.
    if (isCrisisMessage(cleanMessage)) {
      return res.json({ message: CRISIS_RESPONSE, crisis: true, chatSessionToken: newToken || undefined });
    }

    const client = await getOpenAI();
    if (!client) {
      return res.json({ message: staticResponse(cleanMessage), chatSessionToken: newToken || undefined });
    }

    try {
      const systemPrompt = await buildSystemPrompt();
      // Topic-gated teaching documents: appended only when the message or
      // recent turns touch the topic, so ordinary chats pay no extra tokens.
      const teachingContext = getTeachingContext(cleanMessage, turns);
      const response = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt + teachingContext },
          ...turns,
          { role: 'user', content: cleanMessage },
        ],
        max_tokens: 500,
      });
      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return res.json({ message: staticResponse(cleanMessage), chatSessionToken: newToken || undefined });
      }
      return res.json({ message: content, chatSessionToken: newToken || undefined });
    } catch (err) {
      console.error('[Assistant] OpenAI error:', err.message || err);
      return res.json({ message: staticResponse(cleanMessage), chatSessionToken: newToken || undefined });
    }
  } catch (err) {
    console.error('[Assistant] Request failed:', err.message || err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Served verbatim when the LLM is unavailable — the widget degrades to a
// useful FAQ bot, never a dead one. Facts must match church-profile.js.
export function staticResponse(message) {
  const lower = message.toLowerCase();

  if (/(service|worship|time|schedule|sunday|when)/.test(lower)) {
    return `Here's our Sunday schedule:

- 8:30 AM — Fellowship Time (Sanctuary), with hot breakfast items, donuts, coffee, and juice from the kitchen
- 9:00 AM — Drive-In Service (Garden) — tune your car radio to 87.9 FM
- 10:15 AM — Bible Study (Sanctuary)
- 11:00 AM — Indoor Service (Sanctuary) — same sermon as the drive-in

We also have Bible study Wednesdays at 6:00 PM, and communion is served every Sunday. See /services for details.`;
  }

  if (/(where|address|located|location|direction|parking|find you)/.test(lower)) {
    return `We're at 1700 S Clara Ave, DeLand, FL 32720. For the 9:00 AM drive-in service, pull right into the garden and tune to 87.9 FM. For indoor services, park in the lot and come on in. There's a map and directions on /contact and /new-here.`;
  }

  if (/(give|giving|donat|tith|offering)/.test(lower)) {
    return `You can give online at /give — one-time or recurring, by secure card payment. Open Door is a 501(c)(3) organization and receipts are emailed automatically. For anything else about giving, the church office can help: (386) 734-8200.`;
  }

  if (/(new here|first time|visit|expect|wear|dress)/.test(lower)) {
    return `We'd love to have you! There's no dress code — come as you are. Our /new-here page has everything for a first visit: the Sunday schedule, what to expect, parking, and a "Plan My Visit" form so we can save you a warm welcome.`;
  }

  if (/(pray|prayer)/.test(lower)) {
    return `We'd be honored to pray with you. You can send a prayer request through the form at /contact — our church family takes every one to heart. If you'd like to talk with someone, you can also ask for a person right here in this chat, or call the office at (386) 734-8200 (Tue–Fri, 9 AM–2 PM).`;
  }

  if (/(contact|phone|email|office|reach|talk|pastor)/.test(lower)) {
    return `You can reach us at (386) 734-8200 (office hours Tuesday–Friday, 9 AM–2 PM), through the form at /contact, or by email at hello@opendoorchristian.church. To learn about Pastor Steve, see /our-pastor.`;
  }

  return `Thanks for your message! I can help with service times, directions, what to expect on a first visit, events, giving, and prayer requests. What would you like to know? (For anything else, the contact page at /contact reaches the church directly.)`;
}

export default router;
