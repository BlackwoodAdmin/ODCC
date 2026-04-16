import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatTime,
  todayET,
  nowET,
  truncate,
} from '../../src/utils/formatters.js';

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats a YYYY-MM-DD string as the same calendar date (no UTC shift)', () => {
    // Regression: 4/8 event displayed as 4/7 because UTC midnight parsed in ET
    // went backwards by 4-5 hours. Must display as April 8, 2026.
    expect(formatDate('2026-04-08')).toBe('April 8, 2026');
  });

  it('formats a numeric timestamp in ET', () => {
    // 2026-01-01 12:00:00 UTC → 2026-01-01 07:00 ET (still Jan 1)
    const ts = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(formatDate(ts)).toBe('January 1, 2026');
  });

  it('parses numeric-string timestamps', () => {
    const ts = Date.UTC(2026, 5, 15, 12, 0, 0);
    expect(formatDate(String(ts))).toBe('June 15, 2026');
  });
});

describe('formatDateTime', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('')).toBe('');
  });

  it('formats a timestamp with time in ET', () => {
    // 2026-03-15 17:30 UTC → 2026-03-15 13:30 EDT (America/New_York is EDT on 3/15)
    const ts = Date.UTC(2026, 2, 15, 17, 30, 0);
    const result = formatDateTime(ts);
    // Shape: "Mar 15, 2026, 1:30 PM" — check stable parts (format may vary slightly by Node)
    expect(result).toMatch(/Mar 15, 2026/);
    expect(result).toMatch(/1:30\s*PM/);
  });
});

describe('formatTime', () => {
  it('formats morning time with AM', () => {
    expect(formatTime('09:05')).toBe('9:05 AM');
  });

  it('formats afternoon time with PM', () => {
    expect(formatTime('14:30')).toBe('2:30 PM');
  });

  it('formats midnight as 12 AM', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
  });

  it('formats noon as 12 PM', () => {
    expect(formatTime('12:00')).toBe('12:00 PM');
  });

  it('returns empty string for falsy input', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime('')).toBe('');
  });
});

describe('todayET', () => {
  it('returns YYYY-MM-DD shape', () => {
    expect(todayET()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('nowET', () => {
  it('returns a Date instance', () => {
    expect(nowET()).toBeInstanceOf(Date);
  });
});

describe('truncate', () => {
  it('returns the input unchanged if shorter than the limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('appends ellipsis when truncating', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde...');
  });

  it('returns falsy input untouched', () => {
    expect(truncate(null)).toBeNull();
    expect(truncate('')).toBe('');
  });
});
