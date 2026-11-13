import { describe, it, expect } from 'vitest';
import {
  matchesSexualityTopic, getTeachingContext, SEXUALITY_TEACHING_DOC,
} from '../../server/lib/teaching-documents.js';

describe('sexuality topic matcher', () => {
  it.each([
    'what does the church believe about homosexuality?',
    'do you support same sex marriage',
    'what is your position on same-sex couples',
    'is being gay a sin?',
    'are lesbians welcome here',
    'what do you think about LGBTQ people',
    'my son told me he is gay, what should I do',
    'what is the church view on sexual orientation',
  ])('matches: %s', (msg) => {
    expect(matchesSexualityTopic(msg)).toBe(true);
  });

  it.each([
    'what time is the service?',
    'my mother just passed away, please pray for us',
    'how do I submit a prayer request?',
    'tell me about communion and baptism',
    'what does the church believe about divorce?',
    // Gender-identity questions are deliberately NOT routed to this document —
    // it does not address them.
    'what does the church believe about transgender people',
    // word-boundary: no substring hits inside other words
    'the Gayle family joined last month',
  ])('does NOT match: %s', (msg) => {
    expect(matchesSexualityTopic(msg)).toBe(false);
  });
});

describe('getTeachingContext', () => {
  it('returns the document block when the current message matches', () => {
    const ctx = getTeachingContext('is being gay a sin?', []);
    expect(ctx).toContain('Homosexuality and Fornication');
    expect(ctx).toContain('1 Corinthians 6:11');
    // The handling rules ride along with the document.
    expect(ctx).toContain('lead with the welcome answer');
    expect(ctx).toContain('Pastor Steve');
  });

  it('keeps the context for follow-ups once the topic is open in history', () => {
    const history = [
      { role: 'user', content: 'what does the church teach about same sex marriage?' },
      { role: 'assistant', content: 'Open Door teaches…' },
    ];
    expect(getTeachingContext('but why does that matter?', history)).toContain('Homosexuality and Fornication');
  });

  it('returns an empty string for unrelated conversations (no token cost)', () => {
    expect(getTeachingContext('what time is the drive-in?', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'welcome!' },
    ])).toBe('');
  });

  it('the transcription carries the document\'s own both-ways framing', () => {
    expect(SEXUALITY_TEACHING_DOC).toContain('no less a sin than fornication, and it is no greater one');
    expect(SEXUALITY_TEACHING_DOC).toContain('The sin is the act, not the temptation');
    expect(SEXUALITY_TEACHING_DOC).toContain('washed, but ye are sanctified');
  });
});
