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

// Tags become spaces so adjacent blocks don't run together, then entities
// decode via the DOM so previews don't show literal "&amp;".
export function stripHtml(html) {
  if (!html) return '';
  if (typeof document === 'undefined') {
    // Server-side render path: no DOM, decode the common entities by hand
    // (&amp; last, or "&amp;lt;" would double-decode into a "<").
    return html
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<\/?[^>]+>/g, ' ');
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

// Only tags the rich text editor emits count as HTML, so legacy plain-text
// values like "<optional>" aren't misread (and then destroyed) as markup.
// Single-letter tags must close immediately — the editor writes them without
// attributes — so "<b wing>" stays plain text.
export function containsHtml(str) {
  if (!str) return false;
  return /<(p|br|div|strong|em|a|ul|ol|li|h[1-6]|blockquote|img|pre|code|hr|span)[\s/>]|<[bius][/>]/i.test(str);
}

// Escape before wrapping (same order as server/scripts/migrate-blog-content.js)
// so "<" and "&" in plain text survive. Blank lines become paragraphs; single
// newlines stay as <br> so address blocks don't gain paragraph gaps.
export function plainTextToHtml(str) {
  const text = (str || '').replace(/\r/g, '').trim();
  if (!text) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<p>' + escaped.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}