// All arithmetic is done with UTC components only — never with millisecond
// addition. `+ 7 * 24 * 3600 * 1000` silently produces Saturday 11pm or
// Monday 1am across DST boundaries.

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n) { return String(n).padStart(2, '0'); }

function toIsoDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// Returns the Sunday of the week containing `input`, as a YYYY-MM-DD string.
// Accepts a Date (interpreted in the local TZ) or a YYYY-MM-DD string.
// Defaults to today in browser local time.
export function getSundayOf(input = new Date()) {
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`getSundayOf: invalid date string ${input}`);
    const [y, m, d] = input.split('-').map(Number);
    const ref = new Date(Date.UTC(y, m - 1, d));
    return toIsoDate(new Date(Date.UTC(y, m - 1, d - ref.getUTCDay())));
  }
  const y = input.getFullYear();
  const m = input.getMonth();
  const d = input.getDate();
  const dow = input.getDay();
  return toIsoDate(new Date(Date.UTC(y, m, d - dow)));
}

// addWeeks('2026-04-26', 1) => '2026-05-03'. DST-safe by construction.
export function addWeeks(sundayStr, n) {
  const [y, m, d] = sundayStr.split('-').map(Number);
  return toIsoDate(new Date(Date.UTC(y, m - 1, d + 7 * n)));
}

// formatWeekRange('2026-04-26') => 'Apr 26 – May 2, 2026'
export function formatWeekRange(sundayStr) {
  const [y, m, d] = sundayStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const startMonth = MONTHS_SHORT[start.getUTCMonth()];
  const endMonth = MONTHS_SHORT[end.getUTCMonth()];
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${startMonth} ${start.getUTCDate()}, ${start.getUTCFullYear()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export function isSundayIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d &&
    date.getUTCDay() === 0
  );
}
