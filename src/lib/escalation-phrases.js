// Phrases that signal the visitor wants a human. Word-boundary matching:
// bare substring checks false-match inside longer words ("a personalized
// landing page" contains "to a person").
//
// The first block is the generic set from the reference implementation; the
// second is the church set — church visitors say "can I talk to the pastor",
// not "live rep". Bare "pray"/"prayer" must NOT match: "how do I submit a
// prayer request?" is the single most expected question and the AI answers it
// with the form link. See tests/unit/escalation-phrases.test.js.
export const ESCALATION_PHRASES = [
  // generic
  'speak to someone',
  'talk to a person',
  'talk to someone',
  'speak to a person',
  'human support',
  'real person',
  'live agent',
  'live chat',
  'talk to human',
  'speak to human',
  'representative',
  'connect me',
  'transfer me',
  'real human',
  'actual person',
  'not a bot',
  'speak with someone',
  'talk with someone',
  'live person',
  'to a person',
  'with a person',
  'to a human',
  'with a human',
  'human being',
  // church
  'talk to the pastor',
  'speak to the pastor',
  'talk with the pastor',
  'speak with the pastor',
  'talk to pastor',
  'speak to pastor',
  'pray with me',
  'pray for me right now',
  'someone pray with',
  'talk to the church',
  'speak to the church',
  'is anyone there',
  'is someone there',
];

const PHRASE_PATTERNS = ESCALATION_PHRASES.map(
  (phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
);

/** True if the message contains any escalation phrase (as whole words). */
export function isEscalationRequest(message) {
  if (typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return PHRASE_PATTERNS.some((pattern) => pattern.test(lower));
}
