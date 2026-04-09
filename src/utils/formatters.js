const TZ = 'America/New_York';

export function formatDate(dateInput) {
  if (!dateInput) return '';
  // Date-only strings (YYYY-MM-DD) represent calendar dates, not instants —
  // parse as local date to avoid UTC-midnight-to-ET shift dropping a day
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  // Timestamps — convert to ET
  const timestamp = typeof dateInput === 'string' && /^\d+$/.test(dateInput) ? parseInt(dateInput) : dateInput;
  return new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
}

export function formatDateTime(dateInput) {
  if (!dateInput) return '';
  const timestamp = typeof dateInput === 'string' && /^\d+$/.test(dateInput) ? parseInt(dateInput) : dateInput;
  return new Date(timestamp).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

export function todayET() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}

export function nowET() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

export function truncate(str, len = 150) {
  if (!str || str.length <= len) return str;
  return str.substring(0, len) + '...';
}