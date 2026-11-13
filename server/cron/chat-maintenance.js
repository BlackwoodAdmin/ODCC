// Live-chat maintenance. Started from server/index.js like the email crons.
//
// Every 60 s:
//   - sessions waiting > 2 min with no fallback email -> one email to the
//     office (send-then-mark: a SendGrid failure retries next tick, bounded by
//     the status='waiting' filter)
//   - sessions waiting > 10 min -> ended (BACKSTOP ONLY: the client's 5-minute
//     timer must fire first — it drives the "no one picked up" copy)
// Every 10 min:
//   - connected sessions idle > 30 min -> ended (timeout)
//   - ended sessions past the retention window -> purged
import { sendEmail, escapeHtml } from '../email.js';
import {
  findFallbackEmailCandidates, markFallbackEmailSent,
  endStaleWaitingSessions, endIdleConnectedSessions, purgeOldSessions,
  getChatMessages,
} from '../lib/chat-db.js';
import { publishStatus } from '../lib/chat-bus.js';

const FALLBACK_TO = process.env.CHAT_FALLBACK_EMAIL || 'hello@opendoorchristian.church';
const SITE_URL = process.env.SITE_URL || 'https://opendoorchristian.church';

// Every line of visitor text is HTML-escaped: the chat sanitizer strips
// control characters only, and this email lands in HTML-rendering webmail.
export function transcriptHtml(history, messages) {
  const lines = [];
  for (const turn of history || []) {
    lines.push({ who: turn.role === 'user' ? 'Visitor' : 'Assistant (AI)', text: turn.content });
  }
  for (const m of messages || []) {
    lines.push({ who: m.sender === 'user' ? 'Visitor' : m.sender === 'agent' ? 'Church' : 'System', text: m.content });
  }
  if (!lines.length) return '<p style="color:#6b7280;">(No messages yet.)</p>';
  return lines.map(({ who, text }) =>
    `<p style="margin:0 0 10px;color:#1f2937;font-size:14px;line-height:1.5;"><strong>${escapeHtml(who)}:</strong> ${escapeHtml(text)}</p>`
  ).join('');
}

async function sendFallbackEmail(session) {
  let history = [];
  try {
    history = Array.isArray(session.chat_history) ? session.chat_history : JSON.parse(session.chat_history || '[]');
  } catch { /* leave empty */ }
  const messages = await getChatMessages(session.id);
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">A website visitor is waiting for live chat</h1>
      </div>
      <div style="background:#ffffff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;">
        <p style="color:#4b5563;font-size:14px;">Someone asked to talk to a person on the website and no one has picked up yet. Their conversation so far:</p>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
          ${transcriptHtml(history, messages)}
        </div>
        <p style="color:#6b7280;font-size:13px;">Page: ${escapeHtml(session.page_url || 'unknown')}</p>
        <div style="text-align:center;margin:20px 0 4px;">
          <a href="${SITE_URL}/dashboard/chats" style="display:inline-block;background:#7C9A72;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">
            Open Live Chat Console
          </a>
        </div>
      </div>
    </div>`;
  return sendEmail({ to: FALLBACK_TO, subject: 'Website visitor waiting for live chat', html });
}

async function minuteTick() {
  try {
    for (const session of await findFallbackEmailCandidates()) {
      const sent = await sendFallbackEmail(session);
      if (sent) await markFallbackEmailSent(session.id);
    }
  } catch (err) {
    console.error('[ChatCron] fallback email tick failed:', err.message);
  }
  try {
    for (const id of await endStaleWaitingSessions()) {
      publishStatus(id, 'ended', 'timeout');
    }
  } catch (err) {
    console.error('[ChatCron] waiting sweep failed:', err.message);
  }
}

async function tenMinuteTick() {
  try {
    for (const id of await endIdleConnectedSessions()) {
      publishStatus(id, 'ended', 'timeout');
    }
    const purged = await purgeOldSessions();
    if (purged > 0) console.log(`[ChatCron] purged ${purged} chat session(s) past retention`);
  } catch (err) {
    console.error('[ChatCron] sweep failed:', err.message);
  }
}

export function initChatMaintenance() {
  setInterval(minuteTick, 60 * 1000);
  setInterval(tenMinuteTick, 10 * 60 * 1000);
  console.log('[ChatCron] Live chat maintenance started');
}
