import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';
import { addWeeks, formatWeekRange, isSundayIsoDate } from '../utils/week';

const RichTextEditor = lazy(() => import('../components/editors/RichTextEditor'));

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<\/?[^>]+>/g, ' ');
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

export default function DashboardBulletinEditor() {
  const { weekStart } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedByName, setUpdatedByName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const ignoreNextChangeRef = useRef(false);

  const validWeek = isSundayIsoDate(weekStart);

  useEffect(() => {
    if (!validWeek) return;
    setLoading(true);
    setDirty(false);
    api.get(`/bulletin-notes/${weekStart}`)
      .then(d => {
        ignoreNextChangeRef.current = true;
        setContent(d.note.content || '');
        setUpdatedAt(d.note.updated_at);
        setUpdatedByName(d.note.updated_by_name);
      })
      .catch(err => notify(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [weekStart, validWeek, notify]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleChange = useCallback((html) => {
    if (ignoreNextChangeRef.current) {
      ignoreNextChangeRef.current = false;
      return;
    }
    setContent(html);
    setDirty(true);
  }, []);

  const doSave = async (overwrite = false) => {
    setSaving(true);
    try {
      const body = { content };
      if (!overwrite && updatedAt !== null) body.expected_updated_at = updatedAt;
      const data = await api.put(`/bulletin-notes/${weekStart}`, body);
      setUpdatedAt(data.note.updated_at);
      setUpdatedByName(data.note.updated_by_name);
      setDirty(false);
      notify('Saved', 'success');
    } catch (err) {
      if (err.status === 409 && err.data?.note) {
        const latest = err.data.note;
        const theirPreview = stripHtml(latest.content).slice(0, 200) || '(empty)';
        const message =
          `${latest.updated_by_name || 'Someone'} saved this week's notes ` +
          `at ${formatDateTime(latest.updated_at)}.\n\n` +
          `Their version: "${theirPreview}"\n\n` +
          `OK = discard your changes and load theirs.\n` +
          `Cancel = overwrite their version with yours.`;
        if (window.confirm(message)) {
          ignoreNextChangeRef.current = true;
          setContent(latest.content || '');
          setUpdatedAt(latest.updated_at);
          setUpdatedByName(latest.updated_by_name);
          setDirty(false);
        } else {
          await doSave(true);
        }
      } else {
        notify(err.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => { doSave(false); };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stripHtml(content));
      notify('Copied to clipboard', 'success');
    } catch {
      notify('Copy failed', 'error');
    }
  };

  const goToWeek = (n) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate(`/dashboard/bulletin/${addWeeks(weekStart, n)}`);
  };

  if (!validWeek) {
    return (
      <div className="section-padding bg-cream">
        <div className="container-custom">
          <Link to="/dashboard/bulletin" className="text-sm text-sage hover:underline">← Back to bulletin notes</Link>
          <p className="mt-4 text-red-600">Invalid week — must be a Sunday in YYYY-MM-DD format.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="mb-6 print:hidden">
          <Link to="/dashboard/bulletin" className="text-sm text-sage hover:underline">← All weeks</Link>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 print:shadow-none print:p-0 print:bg-transparent" id="bulletin-print-area">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToWeek(-1)}
                className="px-3 py-1.5 rounded border border-gray-200 text-charcoal hover:bg-gray-50 text-sm"
                title="Previous week"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => goToWeek(1)}
                className="px-3 py-1.5 rounded border border-gray-200 text-charcoal hover:bg-gray-50 text-sm"
                title="Next week"
              >
                Next →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded border border-gray-200 text-charcoal hover:bg-gray-50 text-sm"
                title="Copy plain text"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded border border-gray-200 text-charcoal hover:bg-gray-50 text-sm"
                title="Print or save as PDF"
              >
                Print / PDF
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-1.5 rounded bg-sage text-white hover:bg-sage/90 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div className="print:block hidden mb-4 border-b border-black pb-2">
            <div className="text-sm font-semibold uppercase tracking-wide">Open Door Christian Church</div>
            <div className="text-2xl font-bold">Bulletin Notes — {formatWeekRange(weekStart)}</div>
          </div>

          <div className="print:hidden mb-4">
            <h1 className="text-3xl font-bold text-charcoal">{formatWeekRange(weekStart)}</h1>
            {updatedAt ? (
              <p className="text-sm text-gray-500 mt-1">
                Last edited {formatDateTime(updatedAt)}{updatedByName ? ` by ${updatedByName}` : ''}
                {dirty && <span className="ml-2 text-amber-600">• Unsaved changes</span>}
              </p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">New week — not yet saved</p>
            )}
          </div>

          {loading ? (
            <p className="text-gray-500 print:hidden">Loading…</p>
          ) : (
            <>
              <div className="print:hidden">
                <Suspense fallback={<p className="text-gray-500">Loading editor…</p>}>
                  <RichTextEditor value={content} onChange={handleChange} />
                </Suspense>
              </div>
              <div
                className="hidden print:block bulletin-print-content"
                dangerouslySetInnerHTML={{ __html: content || '<p style="color:#888">(empty)</p>' }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
