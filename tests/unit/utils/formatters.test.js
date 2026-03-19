import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatTime, truncate } from '@src/utils/formatters.js';

describe('formatDate utility', () => {
  it('should format timestamp to date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toContain('2024');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle Date objects', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = formatDate(date);
    expect(result).toMatch(/2024/);
  });

  it('should handle Unix milliseconds', () => {
    const ms = 1705324200000; // 2024-01-15
    const result = formatDate(ms);
    expect(result).toMatch(/2024/);
  });

  it('should handle null/undefined gracefully', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});

describe('formatTime utility', () => {
  it('should format 24-hour time to 12-hour AM/PM', () => {
    const result = formatTime('14:30');
    expect(result).toContain('2:30');
    expect(result).toContain('PM');
  });

  it('should format morning time', () => {
    const result = formatTime('09:00');
    expect(result).toContain('9:00');
    expect(result).toContain('AM');
  });

  it('should handle midnight correctly', () => {
    const result = formatTime('00:00');
    expect(result).toContain('12:00');
    expect(result).toContain('AM');
  });

  it('should handle noon correctly', () => {
    const result = formatTime('12:00');
    expect(result).toContain('12:00');
    expect(result).toContain('PM');
  });
});

describe('truncate utility', () => {
  it('should truncate string to max length with ellipsis', () => {
    const result = truncate('Hello World', 5);
    expect(result).toBe('Hello...');
    expect(result.length).toBeLessThanOrEqual(8); // 5 + 3 for ...
  });

  it('should not truncate if under limit', () => {
    const result = truncate('Hello', 10);
    expect(result).toBe('Hello');
  });

  it('should use default length if not specified', () => {
    const longStr = 'a'.repeat(200);
    const result = truncate(longStr);
    expect(result.length).toBeLessThanOrEqual(153); // 150 + 3 for ...
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle empty string', () => {
    const result = truncate('', 5);
    expect(result).toBe('');
  });

  it('should handle null/undefined', () => {
    expect(truncate(null, 5)).toBeFalsy();
    expect(truncate(undefined, 5)).toBeFalsy();
  });
});

describe('formatDateTime utility', () => {
  it('should format timestamp to date and time string', () => {
    const result = formatDateTime('2024-01-15T14:30:00Z');
    expect(result).toContain('2024');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null/undefined gracefully', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
  });
});