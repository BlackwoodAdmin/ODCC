// Deterministic crisis layer. Runs server-side on EVERY visitor message, in
// every state — the system-prompt guardrail is reinforcement, this is the
// mechanism. On a match the OpenAI call is skipped entirely (never
// call-and-discard) and the fixed response below is returned.
//
// The list is deliberately conservative, first-person constructions only:
// grief ("my mother just passed away, please pray for us") and scripture
// ("Jesus died for our sins") must NOT fire it — a 988 banner pinned on a
// griever is tone-deaf in the one interaction where tone is the product.
// See tests/unit/crisis-phrases.test.js for the required negatives.
const CRISIS_PHRASES = [
  'kill myself',
  'killing myself',
  'end my life',
  'ending my life',
  'take my own life',
  'want to die',
  'wanna die',
  'rather be dead',
  'hurt myself',
  'hurting myself',
  'harm myself',
  'harming myself',
  'self harm',
  'self-harm',
  'suicide',
  'suicidal',
  'overdose on',
  'being abused',
  'abusing me',
  'he hits me',
  'she hits me',
  'afraid for my life',
];

// Word-boundary matching, same discipline as the escalation phrases: bare
// substring checks false-match inside longer words.
const PATTERNS = CRISIS_PHRASES.map(
  (phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
);

/** True if the message contains any crisis phrase (as whole words). */
export function isCrisisMessage(message) {
  if (typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return PATTERNS.some((pattern) => pattern.test(lower));
}

// Hand-written, fixed. Reviewed copy — do not let a model generate this.
export const CRISIS_RESPONSE = `I'm really glad you told me, and I want you to know you're not alone in this.

If you are in immediate danger, please call 911 right now.

If you're having thoughts of hurting yourself, please call or text 988 — the Suicide & Crisis Lifeline. It's free, confidential, and someone caring is there 24/7.

And please reach out to us too — you can ask to talk to a person right here in this chat, send a prayer request at our contact page (/contact), or call the church office at (386) 734-8200 (Tue–Fri, 9 AM–2 PM). Pastor Steve and this church family care about you.`;
