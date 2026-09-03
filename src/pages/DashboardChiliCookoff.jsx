import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';

// Admin roster for the Jr Chili Cook-Off (Fall Festival, Oct 17 2026).

const DIVISION_LABEL = { junior: 'Ages 7–12', teen: 'Ages 13–19' };
const AGES = Array.from({ length: 13 }, (_, i) => 7 + i);
const EMPTY_ENTRY = { cook_first_name: '', age: '', chili_name: '', parent_name: '', parent_email: '', parent_phone: '', notes: '' };
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EntryModal({ initial, mode, onClose, onSaved }) {
  const { notify } = useNotification();
  const [form, setForm] = useState({ ...EMPTY_ENTRY, ...initial, age: initial?.age ?? '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, age: Number(form.age) };
      const res = mode === 'edit'
        ? await api.put(`/chili-cookoff/entries/${initial.id}`, payload)
        : await api.post('/chili-cookoff/entries/walkin', payload);
      notify(mode === 'edit' ? 'Entry updated' : 'Walk-in added');
      onSaved(res.entry);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-charcoal">{mode === 'edit' ? 'Edit entry' : 'Add walk-in entry'}</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Cook's first name *</label>
            <input value={form.cook_first_name} onChange={set('cook_first_name')} required maxLength={100} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Age *</label>
            <select value={form.age} onChange={set('age')} required className={INPUT + ' bg-white'}>
              <option value="">—</option>
              {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Chili name *</label>
          <input value={form.chili_name} onChange={set('chili_name')} required maxLength={150} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Parent/guardian name *</label>
          <input value={form.parent_name} onChange={set('parent_name')} required maxLength={150} className={INPUT} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parent email *</label>
            <input type="email" value={form.parent_email} onChange={set('parent_email')} required maxLength={255} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parent phone</label>
            <input type="tel" value={form.parent_phone || ''} onChange={set('parent_phone')} maxLength={20} className={INPUT} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={form.notes || ''} onChange={set('notes')} rows={2} maxLength={500} className={INPUT + ' resize-none'} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-charcoal">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary !py-2 !px-5 text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function SettingsPanel({ settings, status, onSaved }) {
  const { notify } = useNotification();
  const [open, setOpen] = useState(settings.registration_open);
  const [deadline, setDeadline] = useState(toDatetimeLocal(settings.deadline));
  const [capacity, setCapacity] = useState(settings.capacity ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOpen(settings.registration_open);
    setDeadline(toDatetimeLocal(settings.deadline));
    setCapacity(settings.capacity ?? '');
  }, [settings]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/chili-cookoff/settings', {
        registration_open: open,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        capacity: capacity === '' ? null : Number(capacity),
      });
      notify('Settings saved');
      onSaved(res);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusText = status?.open
    ? 'Open — the public page is accepting registrations.'
    : status?.reason === 'deadline' ? 'Closed — the deadline has passed (walk-in message is showing).'
    : status?.reason === 'full' ? 'Closed — capacity reached (walk-in message is showing).'
    : 'Closed — turned off by an admin.';

  return (
    <form onSubmit={save} className="bg-white rounded-xl shadow-md p-6 grid md:grid-cols-4 gap-4 items-end" data-print-hide>
      <div className="md:col-span-4 text-sm">
        <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${status?.open ? 'bg-sage-500' : 'bg-red-500'}`} />
        <span className="text-gray-600">{statusText}</span>
      </div>
      <label className="flex items-center gap-2 text-sm text-charcoal">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-sage-500" />
        Online registration on
      </label>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Pre-registration deadline</label>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Capacity (blank = unlimited)</label>
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={INPUT} />
      </div>
      <button type="submit" disabled={saving} className="btn-primary !py-2 text-sm">{saving ? 'Saving...' : 'Save settings'}</button>
    </form>
  );
}

export default function DashboardChiliCookoff() {
  const { notify } = useNotification();
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({ total: 0, junior: 0, teen: 0, checked_in: 0 });
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [division, setDivision] = useState('all');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'edit'|'walkin', entry? }
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, cfg] = await Promise.all([api.get('/chili-cookoff/entries'), api.get('/chili-cookoff/settings')]);
      setEntries(list.entries || []);
      setCounts(list.counts || counts);
      setSettings(cfg.settings);
      setStatus(cfg.status);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) =>
      (division === 'all' || e.division === division) &&
      (!needle || [e.cook_first_name, e.chili_name, e.parent_name, e.parent_email, e.parent_phone].some((v) => String(v || '').toLowerCase().includes(needle)))
    );
  }, [entries, division, q]);

  const replaceEntry = (entry) => setEntries((prev) => {
    const exists = prev.some((e) => e.id === entry.id);
    const next = exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    return next;
  });

  const checkIn = async (entry) => {
    try {
      const res = await api.put(`/chili-cookoff/entries/${entry.id}/check-in`);
      replaceEntry(res.entry);
      setCounts((c) => ({ ...c, checked_in: c.checked_in + (entry.checked_in_at ? 0 : 1) }));
      notify(`${res.entry.cook_first_name} checked in as #${res.entry.entry_number}`);
    } catch (err) { notify(err.message, 'error'); }
  };

  const undoCheckIn = async (entry) => {
    try {
      const res = await api.put(`/chili-cookoff/entries/${entry.id}/undo-check-in`);
      replaceEntry(res.entry);
      setCounts((c) => ({ ...c, checked_in: Math.max(0, c.checked_in - 1) }));
    } catch (err) { notify(err.message, 'error'); }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete ${entry.cook_first_name}'s entry ("${entry.chili_name}")?`)) return;
    try {
      await api.delete(`/chili-cookoff/entries/${entry.id}`);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setCounts((c) => ({
        ...c,
        total: c.total - 1,
        [entry.division]: c[entry.division] - 1,
        checked_in: c.checked_in - (entry.checked_in_at ? 1 : 0),
      }));
      notify('Entry deleted');
    } catch (err) { notify(err.message, 'error'); }
  };

  const removeAll = async () => {
    const typed = window.prompt(`This deletes all ${counts.total} entries. Export the CSV first. Type DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    try {
      await api.delete('/chili-cookoff/entries', { confirm: 'DELETE' });
      notify('All entries deleted');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };

  const exportCsv = async () => {
    try {
      const blob = await api.downloadBlob('/chili-cookoff/entries/export.csv');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'jr-chili-cookoff-entries.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { notify(err.message, 'error'); }
  };

  const printRoster = () => {
    const win = window.open('', '_blank');
    if (!win) { notify('Popup blocked — allow popups to print', 'error'); return; }
    const group = (div) => entries.filter((e) => e.division === div)
      .sort((a, b) => (a.entry_number ?? 999) - (b.entry_number ?? 999) || a.cook_first_name.localeCompare(b.cook_first_name));
    const table = (div) => `
      <h2>${DIVISION_LABEL[div]} (${group(div).length})</h2>
      <table><thead><tr><th>#</th><th>Cook</th><th>Age</th><th>Chili</th><th>Parent/guardian</th><th>Phone</th><th>Arrived</th></tr></thead><tbody>
      ${group(div).map((e) => `<tr><td>${e.entry_number ?? ''}</td><td>${escapeHtml(e.cook_first_name)}</td><td>${e.age}</td><td>${escapeHtml(e.chili_name)}</td><td>${escapeHtml(e.parent_name)}</td><td>${escapeHtml(e.parent_phone || '')}</td><td>${e.checked_in_at ? '✔' : '☐'}</td></tr>`).join('')}
      </tbody></table>`;
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>Jr Chili Cook-Off roster</title><style>
      body{font-family:sans-serif;padding:24px;color:#000} h1{margin:0 0 4px} p{margin:0 0 16px;color:#444}
      h2{margin:20px 0 8px;font-size:16px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #999;padding:6px 8px;font-size:13px;text-align:left}
      th{background:#eee} td:nth-child(1),td:nth-child(3),td:nth-child(7){text-align:center;width:1%;white-space:nowrap}
    </style></head><body><h1>Jr Chili Cook-Off roster</h1><p>Free Family Fall Festival · Saturday, October 17, 2026 · Chili drop-off by 11:45 AM · Voting noon–2 PM</p>
    ${table('junior')}${table('teen')}</body></html>`);
    win.document.close();
    const go = () => { try { win.focus(); win.print(); } catch {} };
    if (win.document.readyState === 'complete') go(); else win.addEventListener('load', go);
  };

  const filterBtn = (key, label) => (
    <button key={key} onClick={() => setDivision(key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${division === key ? 'bg-sage text-white' : 'bg-white text-charcoal border border-gray-200 hover:bg-gray-50'}`}>{label}</button>
  );

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline" data-print-hide>← Dashboard</Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-charcoal">🌶️ Jr Chili Cook-Off</h1>
            <p className="text-gray-500 text-sm">Fall Festival · Saturday, October 17, 2026 · Public page: <Link to="/chili-cookoff" className="text-sage hover:underline">/chili-cookoff</Link></p>
          </div>
          <div className="flex flex-wrap gap-2" data-print-hide>
            <button onClick={() => setModal({ mode: 'walkin' })} className="btn-primary !py-2 !px-4 text-sm">+ Add walk-in</button>
            <button onClick={exportCsv} className="btn-secondary !py-2 !px-4 text-sm">Export CSV</button>
            <button onClick={printRoster} className="btn-secondary !py-2 !px-4 text-sm">Print roster</button>
            <button onClick={() => setShowSettings((s) => !s)} className="btn-secondary !py-2 !px-4 text-sm">{showSettings ? 'Hide settings' : 'Settings'}</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[['Total entries', counts.total], ['Ages 7–12', counts.junior], ['Ages 13–19', counts.teen], ['Checked in', counts.checked_in]].map(([label, n]) => (
            <div key={label} className="bg-white rounded-xl shadow-md p-4">
              <p className="text-3xl font-bold text-charcoal">{n}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {showSettings && settings && (
          <div className="mb-6">
            <SettingsPanel settings={settings} status={status} onSaved={(res) => { setSettings(res.settings); setStatus(res.status); }} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4" data-print-hide>
          {filterBtn('all', 'All')}{filterBtn('junior', 'Ages 7–12')}{filterBtn('teen', 'Ages 13–19')}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cook, chili, parent..." className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 max-w-full" />
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl"><p className="text-gray-500">{entries.length ? 'No entries match.' : 'No entries yet. Share the sign-up page!'}</p></div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Cook</th>
                  <th className="px-3 py-2 text-left">Age</th>
                  <th className="px-3 py-2 text-left">Chili</th>
                  <th className="px-3 py-2 text-left">Parent / guardian</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-left">Registered</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right" data-print-hide>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className={`border-t border-gray-100 ${e.checked_in_at ? 'bg-sage-50/60' : ''}`}>
                    <td className="px-3 py-2 font-bold text-charcoal">{e.entry_number ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-charcoal">{e.cook_first_name}</div>
                      <div className="text-xs text-gray-400">{DIVISION_LABEL[e.division]}</div>
                    </td>
                    <td className="px-3 py-2">{e.age}</td>
                    <td className="px-3 py-2 text-charcoal">{e.chili_name}</td>
                    <td className="px-3 py-2">
                      <div>{e.parent_name}</div>
                      <div className="text-xs text-gray-500"><a href={`mailto:${e.parent_email}`} className="hover:text-sage">{e.parent_email}</a>{e.parent_phone && <> · <a href={`tel:${e.parent_phone}`} className="hover:text-sage">{e.parent_phone}</a></>}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-500 max-w-[16rem] whitespace-pre-wrap">{e.notes || ''}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {formatDateTime(e.created_at)}
                      {e.source === 'walkin' && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">walk-in</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {e.checked_in_at
                        ? <span className="text-xs bg-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-medium">Checked in {formatDateTime(e.checked_in_at)}</span>
                        : <span className="text-xs text-gray-400">Not yet</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" data-print-hide>
                      {e.checked_in_at
                        ? <button onClick={() => undoCheckIn(e)} className="text-gray-500 hover:text-charcoal text-xs mr-3">Undo</button>
                        : <button onClick={() => checkIn(e)} className="text-sage hover:text-sage-700 font-medium text-xs mr-3">Check in</button>}
                      <button onClick={() => setModal({ mode: 'edit', entry: e })} className="text-charcoal hover:text-sage text-xs mr-3">Edit</button>
                      <button onClick={() => remove(e)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-8 text-right" data-print-hide>
            <button onClick={removeAll} className="text-xs text-red-500 hover:underline">Delete all entries (after the event)</button>
          </div>
        )}
      </div>

      {modal && (
        <EntryModal
          mode={modal.mode}
          initial={modal.entry || {}}
          onClose={() => setModal(null)}
          onSaved={(entry) => {
            replaceEntry(entry);
            if (modal.mode === 'walkin') setCounts((c) => ({ ...c, total: c.total + 1, [entry.division]: c[entry.division] + 1 }));
            else load();
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
