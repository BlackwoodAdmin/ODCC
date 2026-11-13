import { describe, it, expect } from 'vitest';
import { isEscalationRequest } from '../../src/lib/escalation-phrases.js';

describe('escalation phrase matcher', () => {
  it.each([
    'can I talk to a person',
    'I want to speak to someone please',
    'is this a real person?',
    'I am not a bot material, connect me',
    'live chat please',
    // church phrasings — the generic business list alone would miss all of these
    'can I talk to the pastor',
    'I would like to speak with the pastor about something',
    'can someone pray with me',
    'is anyone there',
    'I need to talk to the church about my situation',
  ])('matches: %s', (msg) => {
    expect(isEscalationRequest(msg)).toBe(true);
  });

  it.each([
    // The single most expected question: must go to the AI (form link), never
    // divert into the handoff flow.
    'how do I submit a prayer request?',
    'do you have a prayer list',
    'I will pray about it',
    'what time is the service',
    // word-boundary regression from the reference (substring "to a person")
    'add a chatbot to a personalized landing page',
    'representatives of the church attended the conference',
  ])('does NOT match: %s', (msg) => {
    expect(isEscalationRequest(msg)).toBe(false);
  });
});
