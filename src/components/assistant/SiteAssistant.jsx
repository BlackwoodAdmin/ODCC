import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Turnstile from '../common/Turnstile';
import useLiveChat from '../../hooks/useLiveChat';
// Single source of truth with the server's deterministic crisis layer: used
// here only for ROUTING (crisis beats the escalation two-step; the message
// still goes to the server, whose fixed response is the mechanism).
import { isCrisisMessage } from '../../../server/lib/crisis-phrases.js';

// sessionStorage keys (per-tab; wrapped in try/catch — private windows throw)
const KEYS = {
  MESSAGES: 'odcc_assistant_messages',
  TOKEN: 'odcc_assistant_token',
  LIVE_SESSION: 'odcc_assistant_live_session',
  OPEN: 'odcc_assistant_open',
};

function loadStored(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    if (value === null || value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

const GREETING = {
  id: 'greeting',
  role: 'assistant',
  content: "Hi, welcome to Open Door! I'm an AI assistant — ask me about service times, directions, what to expect on a first visit, events, or anything else about our church. If you'd rather talk to a person, just say so.",
};

const UNAVAILABLE_COPY = "I'm sorry — no one is available for live chat right now. I'm still happy to help here, or you can reach the church directly through the contact form at /contact (there's a prayer request form there too), or call (386) 734-8200, Tue–Fri 9 AM–2 PM.";
const TIMEOUT_COPY = "I'm so sorry — it looks like no one was able to pick up in time. Your question matters: please send it through the contact form at /contact or the prayer request form there, and someone from the church will get back to you. You can also call the office at (386) 734-8200 (Tue–Fri, 9 AM–2 PM).";

let messageSeq = 0;
function localId() {
  messageSeq += 1;
  return `local-${Date.now()}-${messageSeq}`;
}

const AFFIRMATIVE = /^(yes|yeah|yep|sure|ok|okay|please|yes please|connect me)\b/i;

export default function SiteAssistant() {
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatSessionToken, setChatSessionToken] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [escalationOffered, setEscalationOffered] = useState(false);
  const [crisisPinned, setCrisisPinned] = useState(false);
  const verificationRetriedRef = useRef(false);
  const pendingEscalationRef = useRef(false);
  const bottomRef = useRef(null);

  const turnstileConfigured = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

  const addMessage = useCallback((role, content, extra = {}) => {
    setMessages((prev) => [...prev, { id: localId(), role, content, ...extra }]);
  }, []);

  // ---- live chat
  const liveChat = useLiveChat({
    pageUrl: location.pathname,
    onStatusChange: (status) => {
      if (status === 'connected') {
        addMessage('info', "You're connected — someone from Open Door is here with you.");
      }
    },
    onConnectionTimeout: () => {
      addMessage('assistant', TIMEOUT_COPY);
      liveChat.endChat('timeout');
      store(KEYS.LIVE_SESSION, null);
    },
    onUnavailable: (reason) => {
      if (reason === 'verification' && !verificationRetriedRef.current && turnstileConfigured) {
        // Expired session token + spent Turnstile token: re-challenge and retry
        // once — the agent may well be available (do NOT show unavailable copy).
        verificationRetriedRef.current = true;
        pendingEscalationRef.current = true;
        setChatSessionToken(null);
        setTurnstileToken('');
        setTurnstileReset((v) => v + 1);
        addMessage('info', 'One quick security check below, then I\'ll connect you…');
        return;
      }
      if (reason === 'rate-limited') {
        addMessage('assistant', 'Too many attempts just now — please wait a few minutes and try again, or use the contact form at /contact.');
      } else {
        addMessage('assistant', UNAVAILABLE_COPY);
      }
      store(KEYS.LIVE_SESSION, null);
    },
  });

  const liveActive = liveChat.status === 'connecting' || liveChat.status === 'connected';

  // ---- mount: SSR guard + restore
  useEffect(() => {
    setMounted(true);
    setIsOpen(loadStored(KEYS.OPEN, false) === true);
    const storedMessages = loadStored(KEYS.MESSAGES, null);
    if (Array.isArray(storedMessages) && storedMessages.length) setMessages(storedMessages);
    const storedToken = loadStored(KEYS.TOKEN, null);
    if (typeof storedToken === 'string') setChatSessionToken(storedToken);
    const storedSession = loadStored(KEYS.LIVE_SESSION, null);
    if (typeof storedSession === 'string' && storedSession) {
      liveChat.resume(storedSession).then((result) => {
        if (!result) {
          store(KEYS.LIVE_SESSION, null);
        } else if (result.status === 'ended') {
          store(KEYS.LIVE_SESSION, null);
          addMessage('assistant', result.endReason === 'timeout' ? TIMEOUT_COPY : 'Your live chat has ended. I\'m still here if you have more questions!');
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Anything on the site (the header's Chat link) can open the widget by
  // dispatching this event — no prop plumbing across layout components.
  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener('odcc:open-assistant', open);
    return () => window.removeEventListener('odcc:open-assistant', open);
  }, []);

  // ---- persistence
  useEffect(() => { if (mounted) store(KEYS.MESSAGES, messages.slice(-50)); }, [messages, mounted]);
  useEffect(() => { if (mounted) store(KEYS.TOKEN, chatSessionToken); }, [chatSessionToken, mounted]);
  useEffect(() => { if (mounted) store(KEYS.OPEN, isOpen); }, [isOpen, mounted]);
  useEffect(() => {
    if (!mounted) return;
    if (liveChat.sessionId) store(KEYS.LIVE_SESSION, liveChat.sessionId);
    else if (liveChat.status === 'ended' || liveChat.status === 'idle') store(KEYS.LIVE_SESSION, null);
  }, [liveChat.sessionId, liveChat.status, mounted]);

  // ---- autoscroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, liveChat.messages, isOpen]);

  // ---- escalation
  const historyTurns = useCallback(() => (
    messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }))
  ), [messages]);

  const beginEscalation = useCallback(() => {
    verificationRetriedRef.current = false;
    setEscalationOffered(false);
    addMessage('info', 'Looking for someone at the church to join the chat…');
    liveChat.startEscalation(historyTurns(), turnstileToken || undefined, chatSessionToken || undefined);
    setTurnstileToken('');
  }, [addMessage, liveChat, historyTurns, turnstileToken, chatSessionToken]);

  const handleTalkToPerson = useCallback(() => {
    if (liveActive) return;
    if (!liveChat.isAgentAvailable) {
      addMessage('assistant', UNAVAILABLE_COPY);
      return;
    }
    beginEscalation();
  }, [liveActive, liveChat.isAgentAvailable, addMessage, beginEscalation]);

  // Turnstile success: deliver a pending escalation retry automatically.
  const handleTurnstileToken = useCallback((token) => {
    setTurnstileToken(token);
    if (pendingEscalationRef.current) {
      pendingEscalationRef.current = false;
      verificationRetriedRef.current = true;
      addMessage('info', 'Thanks — connecting you now…');
      liveChat.startEscalation(historyTurns(), token, undefined);
    }
  }, [addMessage, liveChat, historyTurns]);

  // ---- send
  const handleSend = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    // Live mode: relay to the human; the stream echoes it back.
    if (liveActive) {
      liveChat.sendMessage(text);
      return;
    }

    addMessage('user', text);

    // Crisis beats escalation: "I want to hurt myself, can I talk to someone"
    // contains an escalation phrase but must get the server's fixed crisis
    // response (which itself offers the connect), never the two-step prompt.
    const crisis = isCrisisMessage(text);

    // Two-step escalation on typed phrases.
    if (!crisis) {
      if (escalationOffered && (AFFIRMATIVE.test(text) || liveChat.isEscalationRequest(text))) {
        setEscalationOffered(false);
        if (!liveChat.isAgentAvailable) {
          addMessage('assistant', UNAVAILABLE_COPY);
          return;
        }
        beginEscalation();
        return;
      }
      if (liveChat.isEscalationRequest(text)) {
        if (!liveChat.isAgentAvailable) {
          addMessage('assistant', UNAVAILABLE_COPY);
          return;
        }
        setEscalationOffered(true);
        addMessage('assistant', 'Of course — would you like me to connect you with a real person from the church right now? Just say yes, or tap "Talk to a person" below.');
        return;
      }
      // Any other message withdraws a pending offer (a later bare "ok" must
      // not silently divert into the handoff).
      if (escalationOffered) setEscalationOffered(false);
    }

    setSending(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyTurns(),
          turnstileToken: turnstileToken || undefined,
          chatSessionToken: chatSessionToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.requireCaptcha) {
          setChatSessionToken(null);
          setTurnstileToken('');
          setTurnstileReset((v) => v + 1);
          addMessage('info', 'Please complete the quick security check below, then send your message again.');
          setInput(text);
        } else if (res.status === 429) {
          addMessage('assistant', 'I need a short breather — please try again in a few minutes.');
        } else {
          addMessage('assistant', 'Something went wrong on my end. Please try again, or reach the church at /contact.');
        }
        return;
      }
      if (data.chatSessionToken) setChatSessionToken(data.chatSessionToken);
      setTurnstileToken('');
      addMessage('assistant', data.message, data.crisis ? { crisis: true } : {});
      if (data.crisis) setCrisisPinned(true);
    } catch {
      addMessage('assistant', 'I couldn\'t reach the church server just now. Please try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  const handleEndLiveChat = () => {
    liveChat.endChat();
    store(KEYS.LIVE_SESSION, null);
    addMessage('info', 'Live chat ended. I\'m still here if you need anything else!');
  };

  // Clear button: wipe the conversation and start fresh. Ends a live chat if
  // one is running. Keeps the chatSessionToken — it's only CAPTCHA proof, so
  // the visitor shouldn't have to re-verify just because they started over.
  const handleClear = () => {
    if (!window.confirm('Clear this conversation and start over?')) return;
    if (liveActive) liveChat.endChat();
    store(KEYS.LIVE_SESSION, null);
    store(KEYS.MESSAGES, null);
    setMessages([GREETING]);
    setCrisisPinned(false);
    setEscalationOffered(false);
    setInput('');
  };

  // Dashboard pages never show the widget; render nothing until mounted
  // (SSR contract: no browser-only output in the server-rendered HTML).
  if (!mounted || location.pathname.startsWith('/dashboard')) return null;

  const needsVerification = turnstileConfigured && !chatSessionToken && !turnstileToken && !liveActive;
  const liveSystemPinned = liveChat.messages.some((m) => m.sender === 'system');

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: 'min(34rem, calc(100vh - 7rem))' }}>
          {/* Header */}
          <div className="bg-sage text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold leading-tight">Ask Open Door</p>
              <p className="text-xs opacity-90 flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${liveChat.isAgentAvailable ? 'bg-green-300' : 'bg-white/40'}`}></span>
                {liveChat.status === 'connected' ? 'Live with a real person'
                  : liveChat.status === 'connecting' ? 'Finding someone…'
                  : liveChat.isAgentAvailable ? 'AI assistant · a person is available'
                  : 'AI assistant'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {liveActive && (
                <button onClick={handleEndLiveChat} className="text-xs bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1" title="End live chat">End</button>
              )}
              <button onClick={handleClear} className="p-1.5 hover:bg-white/15 rounded-full" aria-label="Clear conversation and start over" title="Clear chat">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/15 rounded-full" aria-label="Close chat">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
          </div>

          {/* Crisis banner (pinned) */}
          {(crisisPinned || liveSystemPinned) && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800">
              <strong>If you're in crisis:</strong> call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline) — or <strong>911</strong> in an emergency. You matter.
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-cream/40">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} crisis={m.crisis} />
            ))}
            {liveChat.messages.map((m) => (
              <MessageBubble
                key={`live-${m.id}`}
                role={m.sender === 'user' ? 'user' : m.sender === 'system' ? 'assistant' : 'agent'}
                content={m.content}
                crisis={m.sender === 'system'}
              />
            ))}
            {liveChat.status === 'connecting' && (
              <p className="text-center text-xs text-gray-500 animate-pulse">Waiting for someone from the church to join… (we'll keep trying for a few minutes)</p>
            )}
            {liveChat.status === 'connected' && liveChat.isAgentTyping && (
              <div className="flex justify-start"><div className="bg-earth/10 border border-earth/20 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm"><span className="inline-flex gap-1"><Dot /><Dot delay="150ms" /><Dot delay="300ms" /></span></div></div>
            )}
            {sending && (
              <div className="flex justify-start"><div className="bg-white rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm"><span className="inline-flex gap-1"><Dot /><Dot delay="150ms" /><Dot delay="300ms" /></span></div></div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Talk to a person */}
          {!liveActive && (
            <div className="px-4 pt-2 bg-white border-t border-gray-100">
              <button
                onClick={handleTalkToPerson}
                className={`w-full text-sm font-medium rounded-lg py-2 transition-colors ${liveChat.isAgentAvailable ? 'bg-sage/10 text-sage hover:bg-sage/20' : 'bg-gray-50 text-gray-400'}`}
              >
                👋 Talk to a person{liveChat.isAgentAvailable ? ' — someone is available' : ''}
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 bg-white">
            <Turnstile onToken={handleTurnstileToken} resetKey={turnstileReset} />
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={liveActive ? 'Message the church…' : needsVerification ? 'One moment — verifying…' : 'Ask about visiting, services, events…'}
                maxLength={2000}
                disabled={needsVerification}
                className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-sage"
              />
              <button
                type="submit"
                disabled={sending || needsVerification || !input.trim()}
                className="bg-sage text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40"
                aria-label="Send"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              AI assistant — answers can be imperfect. Conversations may be reviewed by church staff.
            </p>
          </form>
        </div>
      )}

      {/* Launcher */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="bg-sage text-white rounded-full shadow-lg hover:shadow-xl transition-all w-14 h-14 flex items-center justify-center relative"
        aria-label={isOpen ? 'Close chat' : 'Open chat — Ask Open Door'}
      >
        {liveChat.isAgentAvailable && !isOpen && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full"></span>
        )}
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 7l3.5-3.5H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00.5 1.3L4 21z" /></svg>
        )}
      </button>
    </div>
  );
}

function MessageBubble({ role, content, crisis }) {
  if (role === 'info') {
    return <p className="text-center text-xs text-gray-500 px-4">{content}</p>;
  }
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
        isUser ? 'bg-sage text-white rounded-br-sm'
          : crisis ? 'bg-red-50 text-red-900 border border-red-200 rounded-bl-sm'
          : role === 'agent' ? 'bg-earth/10 text-charcoal border border-earth/20 rounded-bl-sm'
          : 'bg-white text-charcoal rounded-bl-sm'
      }`}>
        {role === 'agent' && <p className="text-[10px] font-semibold text-earth mb-0.5">Open Door</p>}
        {content}
      </div>
    </div>
  );
}

function Dot({ delay = '0ms' }) {
  return <span className="w-1.5 h-1.5 bg-gray-400 rounded-full inline-block animate-bounce" style={{ animationDelay: delay }} />;
}
