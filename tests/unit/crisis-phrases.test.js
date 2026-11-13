import { describe, it, expect } from 'vitest';
import { isCrisisMessage, CRISIS_RESPONSE } from '../../server/lib/crisis-phrases.js';
import { isEscalationRequest } from '../../src/lib/escalation-phrases.js';

describe('crisis phrase matcher', () => {
  it.each([
    'I want to kill myself',
    "i've been thinking about suicide",
    'I feel suicidal tonight',
    'sometimes I think about hurting myself',
    'I want to end my life',
    'I just want to die',
    'he hits me when he drinks',
    'I am being abused at home',
    'I want to hurt myself, can I talk to someone',
  ])('matches: %s', (msg) => {
    expect(isCrisisMessage(msg)).toBe(true);
  });

  // Required negatives from the plan: grief and scripture must NOT pin a 988
  // banner on a griever — tone is the product.
  it.each([
    'my mother just passed away, please pray for us',
    'Jesus died for our sins',
    'how do I submit a prayer request?',
    'my grandfather died last week and the funeral is Saturday',
    'what does the church believe about life after death?',
    'the sermon about dying to self really moved me',
  ])('does NOT match: %s', (msg) => {
    expect(isCrisisMessage(msg)).toBe(false);
  });

  it('crisis takes precedence over escalation phrasing (routing contract)', () => {
    const msg = 'I want to hurt myself, can I talk to someone';
    // Contains an escalation phrase…
    expect(isEscalationRequest(msg)).toBe(true);
    // …but the crisis matcher also fires, and the widget checks crisis FIRST,
    // so this message reaches the server's fixed response, not the two-step
    // connect prompt.
    expect(isCrisisMessage(msg)).toBe(true);
  });

  it('the fixed response is hand-written and carries 988 and 911', () => {
    expect(CRISIS_RESPONSE).toContain('988');
    expect(CRISIS_RESPONSE).toContain('911');
    expect(CRISIS_RESPONSE).toContain('(386) 734-8200');
  });
});
