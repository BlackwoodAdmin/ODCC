import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import useNotification from '../../hooks/useNotification';

// Console controls for Dashboard → Live Chat: health strip, phone push
// notifications, the weekly auto-presence schedule, and the assistant
// knowledge overrides. Phone-first: big tap targets, one column.

function ago(ts, now) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

// ---------------------------------------------------------------- health

export function useHealth() {
  const [health, setHealth] = useState(null);
  const load = useCallback(async () => {
    try {
      setHealth(await api.get('/chat/admin/health'));
    } catch { /* strip shows stale data; stream badge covers liveness */ }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  return { health, reload: load };
}

export function HealthStrip({ health, streamUp }) {
  const now = health?.now ?? 0;
  const phones = health?.push?.length ?? 0;
  const badFailures = health?.push?.some((p) => p.failures > 0) ?? false;
  // The push service said "queued" but the phone never confirmed showing it.
  // 90 s grace: a receipt normally lands within seconds; don't flap meanwhile.
  const unconfirmed = health?.push?.some(
    (p) => p.lastSuccessAt !== null && now - p.lastSuccessAt > 90000 &&
      (p.lastDeliveredAt === null || p.lastDeliveredAt < p.lastSuccessAt)
  ) ?? false;

  return (
    <div className="bg-white rounded-xl shadow-sm px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
      <span className={streamUp ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
        {streamUp ? '● Live' : '○ Reconnecting…'}
      </span>
      <span className={phones === 0 || badFailures || unconfirmed ? 'text-amber-600' : 'text-green-600'}>
        📱 {health?.pushConfigured === false
          ? 'Push not configured on the server'
          : phones === 0
            ? 'No phone subscribed'
            : `${phones} phone${phones === 1 ? '' : 's'}${badFailures ? ' · failures' : ''}${unconfirmed ? ' · LAST ALERT UNCONFIRMED' : ''}`}
      </span>
      <span className="text-gray-400">
        Sweep {health?.sweep ? `${ago(health.sweep.ranAt, now)} · ended ${health.sweep.ended}` : 'not yet run'}
      </span>
      <span className="text-gray-400">
        Streams: {health?.subscribers ? `${health.subscribers.sessions} visitor / ${health.subscribers.admin} console` : '—'}
      </span>
      {health?.presence?.updatedAt && (
        <span className="text-gray-400">Presence set {ago(health.presence.updatedAt, now)}{health.presence.updatedFrom === 'schedule' ? ' by schedule' : ''}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- push

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushControls({ onChanged }) {
  const { notify } = useNotification();
  const [state, setState] = useState('loading'); // loading|unsupported|not-configured|denied|off|on
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [publicKey, setPublicKey] = useState(null);

  const detect = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    let config;
    try {
      config = await api.get('/chat/admin/push/config');
    } catch {
      setState('not-configured');
      return;
    }
    if (!config.configured || !config.publicKey) {
      setState('not-configured');
      return;
    }
    setPublicKey(config.publicKey);
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration('/dashboard/');
    const subscription = await registration?.pushManager.getSubscription();
    setState(subscription ? 'on' : 'off');
  }, []);

  useEffect(() => { detect(); }, [detect]);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        setNote('Notifications are blocked for this site. Allow them in the browser settings, then try again.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/dashboard/' });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
      await api.post('/chat/admin/push/subscribe', { ...subscription.toJSON(), userAgent: navigator.userAgent });
      setState('on');
      setNote('This phone will be alerted for new chats. Send a test to confirm it arrives with the browser in the background.');
      onChanged?.();
    } catch (e) {
      setNote(e.message || 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/dashboard/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.post('/chat/admin/push/unsubscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState('off');
      onChanged?.();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { result } = await api.post('/chat/admin/push/test');
      if (!result || result.skipped) setNote('Push is not configured on the server or no phone is subscribed.');
      else setNote(`Sent to ${result.sent} phone${result.sent === 1 ? '' : 's'}${result.failed ? `, ${result.failed} failed` : ''}. Check the lock screen.`);
      onChanged?.();
    } catch (e) {
      setNote(e.message || 'Test failed.');
    } finally {
      setBusy(false);
    }
  };

  const label =
    state === 'unsupported' ? 'This browser cannot receive push notifications — open the dashboard in Chrome on the phone.'
      : state === 'not-configured' ? 'Push is not configured on the server (VAPID keys missing).'
      : state === 'denied' ? 'Notifications are blocked for this site.'
      : state === 'on' ? 'Phone notifications are ON for this device.'
      : state === 'loading' ? 'Checking…'
      : 'Turn on phone notifications to be alerted of new chats — even with the browser closed.';

  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <h3 className="font-bold text-charcoal mb-1">📲 Phone alerts</h3>
      <p className="text-sm text-gray-600">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {state === 'off' && (
          <button disabled={busy} onClick={enable} className="btn-primary text-sm !py-2 !px-4 disabled:opacity-50">Enable phone notifications</button>
        )}
        {state === 'on' && (
          <>
            <button disabled={busy} onClick={sendTest} className="bg-gray-100 hover:bg-gray-200 text-charcoal text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">Send test push</button>
            <button disabled={busy} onClick={disable} className="text-sm text-gray-400 hover:text-red-500 px-2 disabled:opacity-50">Turn off on this device</button>
          </>
        )}
      </div>
      {note && <p className="mt-2 text-sm text-gray-500">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- schedule

const DISPLAY_ROWS = [
  { label: 'Monday', js: 1 }, { label: 'Tuesday', js: 2 }, { label: 'Wednesday', js: 3 },
  { label: 'Thursday', js: 4 }, { label: 'Friday', js: 5 }, { label: 'Saturday', js: 6 },
  { label: 'Sunday', js: 0 },
];

export function ScheduleControls({ onSaved }) {
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/chat/admin/schedule');
      setData(d);
      setEnabled(d.enabled);
      setDays(d.days);
    } catch (e) {
      setNote(e.message || 'Failed to load schedule');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateDay = (js, patch) => {
    setDays((prev) => prev.map((d, i) => (i === js ? { ...d, ...patch } : d)));
  };

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const d = await api.put('/chat/admin/schedule', { enabled, days });
      setData(d);
      setEnabled(d.enabled);
      setDays(d.days);
      setNote('Saved. Any manual override was cleared.');
      onSaved?.();
    } catch (e) {
      setNote(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="bg-white rounded-xl shadow-md p-5 text-sm text-gray-400">Loading schedule…</div>;

  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-charcoal">🗓 Auto schedule</h3>
          <p className="text-sm text-gray-600">Flip Available/Away automatically each week.</p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-500">
        Schedule now says: <span className={data.desiredNow ? 'text-green-600 font-medium' : 'text-gray-600'}>{data.desiredNow ? 'Available' : 'Away'}</span>
        {data.overrideActive && <span className="text-amber-600"> · manual override active until the next scheduled change</span>}
        {!data.daysValid && <span className="text-red-500"> · saved schedule was invalid; re-save below</span>}
      </p>

      <div className={`mt-4 space-y-2 ${enabled ? '' : 'opacity-50'}`}>
        {DISPLAY_ROWS.map(({ label, js }) => {
          const day = days[js] || { enabled: false, open: '09:00', close: '17:00' };
          return (
            <div key={js} className="flex items-center gap-3">
              <label className="flex w-28 flex-shrink-0 items-center gap-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  disabled={!enabled}
                  onChange={(e) => updateDay(js, { enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {label}
              </label>
              {day.enabled ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="time" value={day.open} disabled={!enabled} onChange={(e) => updateDay(js, { open: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1" />
                  <span className="text-gray-400">to</span>
                  <input type="time" value={day.close} disabled={!enabled} onChange={(e) => updateDay(js, { close: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1" />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Off (away all day)</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Times are Eastern (ET), adjusting for daylight saving automatically. The Available/Away toggle still works: a manual
        change holds until the next scheduled change, then the schedule resumes. Saving clears an active override.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="btn-primary text-sm !py-2 !px-5 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save schedule'}
        </button>
        {note && <span className="text-sm text-gray-500">{note}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------- assistant settings

export function AssistantSettings() {
  const { notify } = useNotification();
  const [open, setOpen] = useState(false);
  const [profileOverride, setProfileOverride] = useState('');
  const [guidelinesOverride, setGuidelinesOverride] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/chat/admin/assistant-settings');
      setProfileOverride(d.profileOverride || '');
      setGuidelinesOverride(d.guidelinesOverride || '');
      setLoaded(true);
    } catch (e) {
      notify(e.message, 'error');
    }
  }, [notify]);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/chat/admin/assistant-settings', { profileOverride, guidelinesOverride });
      notify('Assistant settings saved — live within a minute');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left flex items-center justify-between">
        <div>
          <h3 className="font-bold text-charcoal">🤖 Assistant knowledge</h3>
          <p className="text-sm text-gray-600">Override what the AI knows or how it behaves — no deploy needed. Blank = built-in.</p>
        </div>
        <span className="text-gray-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Church knowledge profile override</label>
            <textarea
              value={profileOverride}
              onChange={(e) => setProfileOverride(e.target.value)}
              rows={10}
              placeholder="Leave blank to use the built-in profile (schedule, beliefs, pastor bio, visitor info…). Anything typed here REPLACES it entirely."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Behavior guidelines override</label>
            <textarea
              value={guidelinesOverride}
              onChange={(e) => setGuidelinesOverride(e.target.value)}
              rows={6}
              placeholder="Leave blank to use the built-in rules (welcome-first, doctrine handling, referrals). Anything typed here REPLACES them entirely — including the safety rules, so edit with care. The crisis layer stays enforced server-side either way."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <button disabled={busy} onClick={save} className="btn-primary text-sm !py-2 !px-5 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save assistant settings'}
          </button>
        </div>
      )}
    </div>
  );
}
