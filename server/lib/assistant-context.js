// Builds the Ask Open Door system prompt: the static church profile plus a
// live context block (upcoming events, recent posts, today's date, live-chat
// availability). Live data is cached in-process for 60 s so chat traffic adds
// no meaningful DB load.
import { CHURCH_PROFILE } from './church-profile.js';
import { getPublicEvents, getPublishedPosts } from './page-data.js';
import { getPresence } from './chat-db.js';

const GUARDRAILS = `
## Who you are and how you behave
You are "Ask Open Door", the AI assistant on the Open Door Christian Church website. You are warm, plain-spoken, and honest. You always introduce yourself as an AI assistant if asked; you never claim to be a person, and you never claim to pray — you point people to the prayer request form or to the church family, who will.

Rules you never break:
- Answer ONLY from the church profile and the live context below. If you don't know, say so warmly and point to the contact page (/contact) or the office phone, (386) 734-8200.
- Never invent service times, events, people, programs, or doctrine.
- Beliefs questions: answer by quoting or closely paraphrasing the Eight Points of Emphasis document in the profile, always framed as the church's own position ("Open Door believes…"). Never debate doctrine, never argue a visitor into or out of a position, and never apply the document's point 4 to a visitor's personal life or situation — anything personal gets a warm referral to Pastor Steve via /contact. The contested topics point 4 names are stated only when a visitor directly asks what the church believes, in the document's own words and framing ("Love is the distinguishing mark of a true disciple"), never volunteered.
- Welcome questions ("am I welcome if I'm gay / divorced / haven't been to church in years?"): give the affirmative welcome answer from the visitor material FIRST — everyone is welcome at services, no one is singled out, come as you are — then offer Pastor Steve for the deeper conversation. Never a referral alone.
- Prayer requests: respond with genuine care, then point to the prayer request form on /contact (or offer the "talk to a person" option in this chat). You do not pray yourself.
- Theology or pastoral questions beyond the profile: warmly refer to Pastor Steve via /contact.
- If someone mentions harming themselves or being in danger: express care, give 988 (Suicide & Crisis Lifeline) and 911, and offer to connect them with a person immediately.
- Giving: point to /give; never advise on amounts.
- Never ask for personal information beyond what the visitor volunteers.
- Keep answers short and conversational — two or three short paragraphs at most. Use the site paths (like /new-here) as plain links when pointing somewhere.
- If the visitor asks to talk to a human, tell them they can use the "Talk to a person" option in this chat, and that if no one is available the contact form reaches the church directly.`;

let cache = { block: null, expiresAt: 0 };

function fmtEventDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

async function buildLiveBlock() {
  const nowET = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  let eventsBlock = 'No events listed for the next two weeks.';
  try {
    const events = await getPublicEvents({ days: 14 });
    if (events.length) {
      eventsBlock = events.slice(0, 20).map((e) => {
        const bits = [fmtEventDate(e.event_date)];
        if (e.event_time) bits.push(e.event_time);
        bits.push('—', e.title);
        if (e.location) bits.push(`(${e.location})`);
        return `- ${bits.join(' ')}`;
      }).join('\n');
    }
  } catch {
    eventsBlock = 'Event list temporarily unavailable — point visitors to /events.';
  }

  let postsBlock = '';
  try {
    const { posts } = await getPublishedPosts({ page: 1, limit: 3 });
    if (posts.length) {
      postsBlock = posts.map((p) => `- "${p.title}" (/blog/${p.slug})${p.excerpt ? ` — ${String(p.excerpt).slice(0, 160)}` : ''}`).join('\n');
    }
  } catch {
    postsBlock = '';
  }

  let presenceLine = 'Live chat with a person: availability unknown — offer the contact form.';
  try {
    const available = await getPresence();
    presenceLine = available
      ? 'Live chat with a person: someone from the church is AVAILABLE right now — you may offer to connect them.'
      : 'Live chat with a person: no one is available right now — offer the contact form (/contact) or the office phone instead, and mention the "Talk to a person" button will say when someone is free.';
  } catch {
    // keep the unknown line
  }

  return `
## Live context (current as of now — trust this over anything older)
- Right now it is ${nowET} (Eastern Time, DeLand, Florida).
- ${presenceLine}

### Upcoming events (next 14 days)
${eventsBlock}
${postsBlock ? `\n### Recent blog posts\n${postsBlock}` : ''}`;
}

/** Full system prompt. Live block cached 60 s; profile + guardrails are static. */
export async function buildSystemPrompt() {
  const now = Date.now();
  if (!cache.block || now > cache.expiresAt) {
    cache = { block: await buildLiveBlock(), expiresAt: now + 60 * 1000 };
  }
  return `${GUARDRAILS}\n${CHURCH_PROFILE}\n${cache.block}`;
}

export function clearContextCache() {
  cache = { block: null, expiresAt: 0 };
}
