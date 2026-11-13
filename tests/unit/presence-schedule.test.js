import { describe, it, expect } from 'vitest';
import {
  parseHHMM, isValidDays, computeScheduledAvailability, decideScheduleAction, DEFAULT_DAYS,
} from '../../server/lib/presence-schedule.js';

// Fixed instants (Eastern): 2026-11-16 is a Monday, EST (UTC-5) after the
// Nov 1 DST end; 2026-07-06 is a Monday, EDT (UTC-4).
const MON_10AM_EST = Date.UTC(2026, 10, 16, 15, 0); // 10:00 Mon ET
const MON_6PM_EST = Date.UTC(2026, 10, 16, 23, 0);  // 18:00 Mon ET
const SUN_10AM_EST = Date.UTC(2026, 10, 15, 15, 0); // 10:00 Sun ET
const MON_10AM_EDT = Date.UTC(2026, 6, 6, 14, 0);   // 10:00 Mon ET in July (DST)

describe('parseHHMM / isValidDays', () => {
  it('parses valid times and rejects malformed ones', () => {
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
    expect(parseHHMM('24:00')).toBe(null);
    expect(parseHHMM('9:30')).toBe(null);
    expect(parseHHMM('nope')).toBe(null);
  });

  it('validates the 7-day shape and open<close on enabled days', () => {
    expect(isValidDays(DEFAULT_DAYS)).toBe(true);
    expect(isValidDays(DEFAULT_DAYS.slice(0, 6))).toBe(false);
    const bad = DEFAULT_DAYS.map((d, i) => (i === 1 ? { ...d, open: '18:00', close: '09:00' } : d));
    expect(isValidDays(bad)).toBe(false);
    // A disabled day with inverted times is fine (it's Off).
    const offBad = DEFAULT_DAYS.map((d, i) => (i === 0 ? { ...d, enabled: false, open: '18:00', close: '09:00' } : d));
    expect(isValidDays(offBad)).toBe(true);
  });
});

describe('computeScheduledAvailability (Eastern, DST-aware)', () => {
  it('is available inside a weekday window and not outside it', () => {
    expect(computeScheduledAvailability(DEFAULT_DAYS, MON_10AM_EST)).toBe(true);
    expect(computeScheduledAvailability(DEFAULT_DAYS, MON_6PM_EST)).toBe(false);
    expect(computeScheduledAvailability(DEFAULT_DAYS, SUN_10AM_EST)).toBe(false); // Sunday off by default
  });

  it('handles daylight saving: the same ET wall-clock works in July', () => {
    expect(computeScheduledAvailability(DEFAULT_DAYS, MON_10AM_EDT)).toBe(true);
  });

  it('close is exclusive', () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 1 ? { ...d, open: '09:00', close: '15:00' } : d));
    const mon3pm = Date.UTC(2026, 10, 16, 20, 0); // 15:00 EST
    expect(computeScheduledAvailability(days, mon3pm)).toBe(false);
  });
});

describe('decideScheduleAction (manual-wins-until-next-boundary)', () => {
  const base = { enabled: true, daysValid: true, days: DEFAULT_DAYS, overrideDesired: null };

  it('does nothing when the schedule is disabled or invalid', () => {
    expect(decideScheduleAction({ ...base, enabled: false }, false, MON_10AM_EST)).toEqual({});
    expect(decideScheduleAction({ ...base, daysValid: false }, false, MON_10AM_EST)).toEqual({});
  });

  it('applies the scheduled state when presence drifted', () => {
    expect(decideScheduleAction(base, false, MON_10AM_EST)).toEqual({ apply: true });
    expect(decideScheduleAction(base, true, MON_6PM_EST)).toEqual({ apply: false });
    expect(decideScheduleAction(base, true, MON_10AM_EST)).toEqual({});
  });

  it('respects a manual override until the scheduled state changes, then resumes', () => {
    // Admin tapped Away during open hours: override snapshots desired=true.
    const overridden = { ...base, overrideDesired: true };
    // Still inside the window: desired unchanged -> leave the manual state alone.
    expect(decideScheduleAction(overridden, false, MON_10AM_EST)).toEqual({});
    // Window closed: desired changed since the tap -> apply and clear.
    expect(decideScheduleAction(overridden, false, MON_6PM_EST)).toEqual({ apply: false, clearOverride: true });
  });
});
