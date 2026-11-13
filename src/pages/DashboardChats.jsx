import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';

// Live chat console. The event stream authenticates with a 60-second ticket
// minted by a Bearer-authed call — EventSource cannot send headers, and the
// JWT must never go in a query string. The stream is wrapped in a
// MINT-THEN-OPEN loop: on any error/close we re-mint a fresh ticket and
// recreate the EventSource with 1 s -> 30 s backoff (EventSource's own
// auto-reconnect would replay the spent ticket URL and die silently after
// every deploy restart).

const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'Dashboard';

function statusBadge(status) {
  if (status === 'waiting') return 'bg-amber-100 text-amber-700';
  if (status === 'connected') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-500';
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close().catch(() => {});
  } catch { /* no audio without a prior user gesture — the title flash covers it */ }
}

export default function DashboardChats() {
  const { notify } = useNotification();
  const [sessions, setSessions] = useState([]);
  const [presence, setPresence] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null); // { session, messages }
  const [reply, setReply] = useState('');
  const [streamUp, setStreamUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedIdRef = useRef(null);
  const attentionRef = useRef(false);
  const flashRef = useRef(null);

  selectedIdRef.current = selectedId;

  // ---- attention: tab title flash until the admin interacts
  const requestAttention = useCallback(() => {
    beep();
    if (attentionRef.current) return;
    attentionRef.current = true;
    let on = false;
    flashRef.current = setInterval(() => {
      on = !on;
      document.title = on ? '💬 Chat waiting — Open Door' : BASE_TITLE;
    }, 1200);
  }, []);
  const clearAttention = useCallback(() => {
    attentionRef.current = false;
    if (flashRef.current) clearInterval(flashRef.current);
    flashRef.current = null;
    document.title = BASE_TITLE;
  }, []);
  useEffect(() => {
    const stop = () => clearAttention();
    window.addEventListener('focus', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('focus', stop);
      document.removeEventListener('visibilitychange', stop);
      clearAttention();
    };
  }, [clearAttention]);

  // ---- data
  const refreshSessions = useCallback(async () => {
    try {
      const data = await api.get('/chat/admin/sessions');
      setSessions(data.sessions || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  }, [notify]);

  const openSession = useCallback(async (id) => {
    setSelectedId(id);
    try {
      const data = await api.get(`/chat/admin/sessions/${id}`);
      setSelected(data);
    } catch (err) { notify(err.message, 'error'); }
  }, [notify]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // ---- SSE: mint-then-open loop
  useEffect(() => {
    let stream = null;
    let retryTimer = null;
    let attempt = 0;
    let disposed = false;

    const applyEvent = (type, data) => {
      if (type === 'snapshot') {
        if (data.sessions) setSessions(data.sessions);
        if (data.presence) setPresence(Boolean(data.presence.available));
        return;
      }
      if (type === 'session-created') {
        setSessions((prev) => [data, ...prev.filter((s) => s.id !== data.id)]);
        requestAttention();
        return;
      }
      if (type === 'message') {
        setSessions((prev) => prev.map((s) => s.id === data.session_id
          ? { ...s, last_activity_at: data.created_at, message_count: (s.message_count || 0) + 1 }
          : s));
        if (data.session_id === selectedIdRef.current) {
          setSelected((prev) => prev && prev.session.id === data.session_id
            ? { ...prev, messages: prev.messages.some((m) => m.id === data.id) ? prev.messages : [...prev.messages, data] }
            : prev);
        }
        if (data.sender === 'user') requestAttention();
        return;
      }
      if (type === 'status') {
        setSessions((prev) => prev.map((s) => s.id === data.sessionId
          ? { ...s, status: data.status, end_reason: data.endReason ?? s.end_reason }
          : s));
        setSelected((prev) => prev && prev.session.id === data.sessionId
          ? { ...prev, session: { ...prev.session, status: data.status, end_reason: data.endReason ?? prev.session.end_reason } }
          : prev);
        return;
      }
      if (type === 'presence') setPresence(Boolean(data.available));
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      setStreamUp(false);
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
      retryTimer = setTimeout(() => { retryTimer = null; open(); }, delay);
    };

    const open = async () => {
      if (disposed) return;
      let ticket;
      try {
        ({ ticket } = await api.post('/chat/admin/events-ticket'));
      } catch {
        scheduleRetry();
        return;
      }
      if (disposed) return;
      stream = new EventSource(`/api/chat/admin/events?ticket=${encodeURIComponent(ticket)}`);
      for (const type of ['snapshot', 'session-created', 'message', 'status', 'presence']) {
        stream.addEventListener(type, (event) => {
          try { applyEvent(type, JSON.parse(event.data)); } catch { /* malformed */ }
        });
      }
      stream.addEventListener('open', () => { attempt = 0; setStreamUp(true); });
      stream.addEventListener('error', () => {
        // Never let EventSource retry the spent-ticket URL itself.
        try { stream.close(); } catch { /* already closed */ }
        stream = null;
        scheduleRetry();
      });
    };

    open();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (stream) { try { stream.close(); } catch { /* noop */ } }
    };
  }, [requestAttention]);

  // ---- actions
  const togglePresence = async () => {
    try {
      const data = await api.put('/chat/admin/presence', { available: !presence });
      setPresence(data.available);
      notify(data.available ? 'You are now available for live chat' : 'Live chat set to away');
    } catch (err) { notify(err.message, 'error'); }
  };

  const claim = async (id) => {
    try {
      await api.post(`/chat/admin/sessions/${id}/claim`);
      await openSession(id);
    } catch (err) {
      if (err.status === 409) notify('Someone already claimed this chat', 'error');
      else notify(err.message, 'error');
      refreshSessions();
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !selectedId) return;
    setReply('');
    try {
      await api.post(`/chat/admin/sessions/${selectedId}/messages`, { content: text });
    } catch (err) {
      notify(err.message, 'error');
      setReply(text);
    }
  };

  const endChat = async () => {
    if (!selectedId || !window.confirm('End this chat?')) return;
    try {
      await api.post(`/chat/admin/sessions/${selectedId}/end`);
    } catch (err) { notify(err.message, 'error'); }
  };

  const preHandoff = selected?.session?.chat_history || [];
  const waitingCount = sessions.filter((s) => s.status === 'waiting').length;

  return (
    <div className="section-padding bg-cream min-h-screen">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
          <h1 className="text-3xl font-bold text-charcoal">Live Chat</h1>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${streamUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {streamUp ? 'Live' : 'Reconnecting…'}
            </span>
            <button
              onClick={togglePresence}
              className={`text-sm font-semibold px-5 py-2 rounded-full transition-colors ${presence ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
            >
              {presence ? '● Available' : '○ Away'}
            </button>
          </div>
        </div>
        {!presence && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 mb-4">
            Visitors can't start a live chat while you're Away — the assistant offers the contact form instead. Toggle Available when you can answer.
          </p>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Session list */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-charcoal">
              Chats {waitingCount > 0 && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{waitingCount} waiting</span>}
            </div>
            {loading ? (
              <div className="p-6 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage mx-auto"></div></div>
            ) : sessions.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">No chats yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => openSession(s.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-cream/60 transition-colors ${selectedId === s.id ? 'bg-sage/10' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(s.status)}`}>{s.status}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(Number(s.created_at))}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{s.page_url || '—'} · {s.message_count || 0} msg</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Transcript */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-md flex flex-col" style={{ minHeight: '32rem' }}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a chat to view it.</div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(selected.session.status)}`}>{selected.session.status}</span>
                    {selected.session.end_reason && <span className="ml-2 text-xs text-gray-400">({selected.session.end_reason})</span>}
                    <p className="text-xs text-gray-500 mt-1">Started {formatDateTime(Number(selected.session.created_at))} on {selected.session.page_url || '—'}</p>
                  </div>
                  <div className="flex gap-2">
                    {selected.session.status === 'waiting' && (
                      <button onClick={() => claim(selected.session.id)} className="btn-primary text-sm !py-1.5 !px-4">Pick up</button>
                    )}
                    {selected.session.status !== 'ended' && (
                      <button onClick={endChat} className="text-sm text-red-500 hover:underline">End chat</button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[26rem]">
                  {preHandoff.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Conversation as reported by the visitor's browser (AI phase — unverified)
                      </p>
                      {preHandoff.map((t, i) => (
                        <p key={i} className="text-xs text-gray-600 mb-1"><strong>{t.role === 'user' ? 'Visitor' : 'AI'}:</strong> {t.content}</p>
                      ))}
                    </div>
                  )}
                  {selected.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                        m.sender === 'agent' ? 'bg-sage text-white'
                          : m.sender === 'system' ? 'bg-red-50 text-red-900 border border-red-200'
                          : 'bg-gray-100 text-charcoal'
                      }`}>
                        {m.sender === 'system' && <p className="text-[10px] font-bold mb-0.5">⚠ CRISIS RESPONSE SENT TO VISITOR</p>}
                        {m.content}
                        <p className={`text-[10px] mt-1 ${m.sender === 'agent' ? 'text-white/70' : 'text-gray-400'}`}>{formatDateTime(Number(m.created_at))}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {selected.session.status === 'connected' && (
                  <form onSubmit={sendReply} className="p-4 border-t border-gray-100 flex gap-2">
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type your reply…"
                      maxLength={4000}
                      className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-sage"
                    />
                    <button type="submit" disabled={!reply.trim()} className="btn-primary text-sm !py-2 !px-5 disabled:opacity-40">Send</button>
                  </form>
                )}
                {selected.session.status === 'waiting' && (
                  <p className="p-4 border-t border-gray-100 text-sm text-amber-700 bg-amber-50">A visitor is waiting — tap "Pick up" to start talking.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
