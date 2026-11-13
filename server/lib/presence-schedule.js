/**
 * Pure evaluation for the weekly presence schedule (no DB, no React — unit
 * tested). Port of the reference implementation's presence-schedule module.
 *
 * `days` is indexed by JS weekday: 0 = Sunday … 6 = Saturday. Each entry is a
 * single available window `open`–`close` ("HH:MM", 24h), or `enabled: false`
 * for a day that is Off (away all day). Times are always interpreted in
 * SCHEDULE_TIMEZONE (Eastern, DST-aware via Intl).
 *
 * Override semantics (manual-wins-until-next-boundary): a manual presence tap
 * while the schedule is enabled snapshots the CURRENT scheduled state as
 * `overrideDesired`; the scheduler leaves presence alone until the scheduled
 * state next changes, then applies it and clears the override.
 */

/** Fixed church timezone. DST-aware through Intl. */
export const SCHEDULE_TIMEZONE = 'America/New_York';

/** Default: Mon–Fri 09:00–17:00 available, weekends Off. Used when no row exists. */
export const DEFAULT_DAYS = [
  { enabled: false, open: '09:00', close: '17:00' }, // 0 Sun
  { enabled: true, open: '09:00', close: '17:00' },  // 1 Mon
  { enabled: true, open: '09:00', close: '17:00' },  // 2 Tue
  { enabled: true, open: '09:00', close: '17:00' },  // 3 Wed
  { enabled: true, open: '09:00', close: '17:00' },  // 4 Thu
  { enabled: true, open: '09:00', close: '17:00' },  // 5 Fri
  { enabled: false, open: '09:00', close: '17:00' }, // 6 Sat
];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for "HH:MM", or null if malformed. */
export function parseHHMM(value) {
  const m = HHMM.exec(value);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** True only for a well-formed 7-entry days array (enabled days have open < close). */
export function isValidDays(value) {
  if (!Array.isArray(value) || value.length !== 7) return false;
  return value.every((d) => {
    if (!d || typeof d !== 'object') return false;
    if (typeof d.enabled !== 'boolean' || typeof d.open !== 'string' || typeof d.close !== 'string') return false;
    const open = parseHHMM(d.open);
    const close = parseHHMM(d.close);
    if (open === null || close === null) return false;
    return !d.enabled || open < close;
  });
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The weekday (0=Sun..6=Sat) and minutes-since-midnight at `nowMs`, in SCHEDULE_TIMEZONE. */
function zonedWeekdayMinutes(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // 00..23; NOT hour12:false, which renders midnight as "24" on some ICU builds
  }).formatToParts(new Date(nowMs));

  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = WEEKDAY_INDEX[part.value] ?? 0;
    else if (part.type === 'hour') hour = parseInt(part.value, 10);
    else if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  if (hour === 24) hour = 0; // defensive, in case an ICU build still emits "24"
  return { weekday, minutes: hour * 60 + minute };
}

/** Whether the schedule says "available" right now (open ≤ now < close for today's window). */
export function computeScheduledAvailability(days, nowMs) {
  const { weekday, minutes } = zonedWeekdayMinutes(nowMs);
  const day = days[weekday];
  if (!day || !day.enabled) return false;
  const open = parseHHMM(day.open);
  const close = parseHHMM(day.close);
  if (open === null || close === null) return false;
  return minutes >= open && minutes < close;
}

/**
 * Decide what the scheduler tick should do. Pure: the caller performs the writes.
 * - disabled or malformed days -> do nothing.
 * - override active: resume (apply + clear) only when the scheduled state has changed since the tap.
 * - no override: apply the scheduled state when presence has drifted from it.
 * Returns { apply?: boolean, clearOverride?: boolean }.
 */
export function decideScheduleAction(schedule, currentAvailable, nowMs) {
  if (!schedule.enabled || !schedule.daysValid) return {};
  const desired = computeScheduledAvailability(schedule.days, nowMs);

  if (schedule.overrideDesired !== null && schedule.overrideDesired !== undefined) {
    if (desired !== schedule.overrideDesired) return { apply: desired, clearOverride: true };
    return {};
  }

  if (currentAvailable !== desired) return { apply: desired };
  return {};
}
