/**
 * Visitor-side live-chat state machine (framework-free — tested in plain Node
 * with a fake fetch and a fake EventSource; the hook subscribes with
 * useSyncExternalStore). Ported from the reference implementation with this
 * app's routes and two additions: `system` messages (the crisis layer) and
 * `resume()` for refresh recovery via sessionStorage.
 *
 * Behaviour:
 *   - startEscalation: re-check presence, POST /api/chat/escalate, and ONLY on
 *     a 2xx arm the 5-minute agent-response timer and open the event stream.
 *     Any failure returns to idle and calls onUnavailable — EXCEPT a CAPTCHA
 *     rejection (4xx with requireCaptcha: true), reported as reason
 *     'verification' so the widget re-runs Turnstile instead of falsely saying
 *     no one is available.
 *   - The stream's `snapshot` REPLACES local messages (skipped when unchanged);
 *     `message` inserts by id; agent messages fire onAgentMessage.
 *   - `ended` from the server closes the stream client-side.
 *   - If the browser gives up on the EventSource, probe GET /session/:id with
 *     backoff 1 s -> 30 s; 404/410 ends the chat and stops retrying.
 *   - resume(sessionId): probe; if waiting/connected, reattach and re-arm the
 *     REMAINING 5-minute window (floored at 30 s) from the probe's createdAt.
 */

export const AGENT_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;
export const RESUME_TIMER_FLOOR_MS = 30 * 1000;
export const BACKOFF_INITIAL_MS = 1000;
export const BACKOFF_MAX_MS = 30000;
const EVENT_SOURCE_CLOSED = 2;

// ------------------------------------------------------------- pure helpers

export function toClientMessage(m) {
  return { id: String(m.id), sender: m.sender, content: m.content, timestamp: Number(m.created_at ?? m.createdAt) };
}

/** Insert by id in numeric order; a message already present is left alone. */
export function mergeMessage(list, message) {
  if (list.some((m) => m.id === message.id)) return list;
  const next = [...list, message];
  next.sort((a, b) => Number(a.id) - Number(b.id));
  return next;
}

/** Cheap equality for snapshot-vs-state: same length and same last id. */
export function sameMessages(a, b) {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[a.length - 1].id === b[b.length - 1].id;
}

export function backoffDelay(attempt, initialMs = BACKOFF_INITIAL_MS, maxMs = BACKOFF_MAX_MS) {
  return Math.min(maxMs, initialMs * 2 ** Math.max(0, attempt - 1));
}

/** Remaining wait window when resuming a still-waiting session. */
export function remainingWaitMs(createdAt, now = Date.now(), total = AGENT_RESPONSE_TIMEOUT_MS, floor = RESUME_TIMER_FLOOR_MS) {
  return Math.max(floor, total - (now - Number(createdAt)));
}

// ------------------------------------------------------------- client

const INITIAL_STATE = {
  status: 'idle', // idle | connecting | connected | ended
  sessionId: null,
  endReason: null,
  messages: [],
  isAgentAvailable: false,
  isAgentTyping: false,
};

export class LiveChatClient {
  constructor(options = {}) {
    this.pageUrl = options.pageUrl || '/';
    this.callbacks = options.callbacks || {};
    this.fetchImpl = options.fetch || ((input, init) => fetch(input, init));
    this.createEventSource = options.createEventSource || ((url) => new EventSource(url));
    this.userAgent = options.userAgent || (() => (typeof navigator === 'undefined' ? '' : navigator.userAgent));
    this.agentResponseTimeoutMs = options.agentResponseTimeoutMs ?? AGENT_RESPONSE_TIMEOUT_MS;
    this.backoffInitialMs = options.backoffInitialMs ?? BACKOFF_INITIAL_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? BACKOFF_MAX_MS;

    this.state = { ...INITIAL_STATE };
    this.listeners = new Set();
    this.stream = null;
    this.responseTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.hasReceivedAgentMessage = false;
    this.seenIds = new Set();
    this.generation = 0;
  }

  // ---- store interface
  getState = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setPageUrl(pageUrl) { this.pageUrl = pageUrl; }
  setCallbacks(callbacks) { this.callbacks = callbacks; }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of Array.from(this.listeners)) listener();
  }

  updateStatus(status) {
    if (this.state.status === status) return;
    this.setState({ status });
    this.callbacks.onStatusChange?.(status);
  }

  // ---- presence
  async refreshPresence() {
    try {
      const res = await this.fetchImpl('/api/chat/presence', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const available = Boolean(data.available);
      if (available !== this.state.isAgentAvailable) this.setState({ isAgentAvailable: available });
      return available;
    } catch {
      return null;
    }
  }

  // ---- escalation
  async startEscalation(chatHistory, turnstileToken, chatSessionToken) {
    this.resetSession();
    const generation = ++this.generation;
    this.updateStatus('connecting');

    const available = await this.refreshPresence();
    if (generation !== this.generation) return;
    if (available === false) return this.fail('unavailable');

    let response;
    try {
      response = await this.fetchImpl('/api/chat/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: this.pageUrl, userAgent: this.userAgent(), chatHistory, turnstileToken, chatSessionToken }),
      });
    } catch {
      if (generation === this.generation) this.fail('error');
      return;
    }
    if (generation !== this.generation) return;

    if (!response.ok) {
      if (response.status === 503) return this.fail('unavailable');
      if (response.status === 429) return this.fail('rate-limited');
      if (response.status === 400 || response.status === 403) {
        let requireCaptcha = false;
        try {
          const body = await response.json();
          requireCaptcha = body?.requireCaptcha === true;
        } catch { /* not JSON */ }
        if (generation !== this.generation) return;
        return this.fail(requireCaptcha ? 'verification' : 'error');
      }
      return this.fail('error');
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return this.fail('error');
    }
    if (generation !== this.generation) return;
    if (!data.sessionId) return this.fail('error');

    this.setState({ sessionId: data.sessionId, endReason: null });
    this.armResponseTimer(this.agentResponseTimeoutMs);
    this.openStream(data.sessionId);
  }

  /** Reattach after a refresh. Returns the probed status ('waiting' |
   *  'connected' | 'ended' | null when gone/unreachable). */
  async resume(sessionId) {
    this.resetSession();
    const generation = ++this.generation;
    let res;
    try {
      res = await this.fetchImpl(`/api/chat/session/${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    } catch {
      return null;
    }
    if (generation !== this.generation) return null;
    if (!res.ok) return null;
    let data;
    try {
      data = await res.json();
    } catch {
      return null;
    }
    if (generation !== this.generation) return null;
    const status = data?.session?.status;
    if (status !== 'waiting' && status !== 'connected') {
      return status === 'ended' ? { status, endReason: data?.session?.endReason ?? null } : null;
    }
    const incoming = (data.messages || []).map(toClientMessage);
    for (const m of incoming) this.seenIds.add(m.id);
    this.hasReceivedAgentMessage = incoming.some((m) => m.sender === 'agent');
    this.setState({ sessionId, messages: incoming, endReason: null });
    this.updateStatus(status === 'connected' ? 'connected' : 'connecting');
    if (status === 'waiting') {
      this.armResponseTimer(remainingWaitMs(data.session.createdAt, Date.now(), this.agentResponseTimeoutMs));
    }
    this.openStream(sessionId);
    return { status, endReason: null };
  }

  fail(reason) {
    this.clearResponseTimer();
    this.closeStream();
    this.setState({ sessionId: null });
    if (reason === 'unavailable') this.setState({ isAgentAvailable: false });
    this.updateStatus('idle');
    this.callbacks.onUnavailable?.(reason);
  }

  // ---- 5-minute agent-response timer (armed only after a 2xx)
  armResponseTimer(ms) {
    this.clearResponseTimer();
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      if (!this.hasReceivedAgentMessage) this.callbacks.onConnectionTimeout?.();
    }, ms);
  }

  clearResponseTimer() {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }

  // ---- stream
  openStream(sessionId) {
    this.closeStream();
    const generation = this.generation;
    const stream = this.createEventSource(`/api/chat/session/${encodeURIComponent(sessionId)}/events`);
    this.stream = stream;

    const on = (type, handler) => {
      stream.addEventListener(type, (event) => {
        if (generation !== this.generation || this.stream !== stream) return;
        handler(event.data ?? '');
      });
    };

    stream.addEventListener('open', () => {
      if (generation === this.generation && this.stream === stream) this.reconnectAttempt = 0;
    });
    on('snapshot', (raw) => this.applySnapshot(this.parse(raw)));
    on('message', (raw) => this.applyMessage(this.parse(raw)));
    on('status', (raw) => {
      const data = this.parse(raw);
      if (data?.status) this.applyServerStatus(data.status, data.endReason);
    });
    on('presence', (raw) => {
      const data = this.parse(raw);
      const available = Boolean(data?.available);
      if (available !== this.state.isAgentAvailable) this.setState({ isAgentAvailable: available });
    });
    on('typing', (raw) => {
      const data = this.parse(raw);
      this.setState({ isAgentTyping: Boolean(data?.typing) });
    });
    stream.addEventListener('error', () => {
      if (generation !== this.generation || this.stream !== stream) return;
      if (stream.readyState === EVENT_SOURCE_CLOSED) {
        this.stream = null;
        this.scheduleReconnect(sessionId);
      }
    });
  }

  closeStream() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const stream = this.stream;
    this.stream = null;
    if (stream) {
      try { stream.close(); } catch { /* already closed */ }
    }
  }

  scheduleReconnect(sessionId) {
    if (this.state.status === 'ended' || this.state.status === 'idle') return;
    const generation = this.generation;
    this.reconnectAttempt += 1;
    const delay = backoffDelay(this.reconnectAttempt, this.backoffInitialMs, this.backoffMaxMs);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (generation !== this.generation) return;
      let status = 0;
      let endReason = null;
      try {
        const res = await this.fetchImpl(`/api/chat/session/${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        status = res.status;
        if (res.ok) {
          try {
            const body = await res.json();
            endReason = body?.session?.endReason ?? null;
            if (body?.session?.status === 'ended') {
              if (generation !== this.generation) return;
              this.applyServerStatus('ended', endReason);
              return;
            }
          } catch { /* ignore body */ }
        }
      } catch {
        status = 0;
      }
      if (generation !== this.generation) return;
      if (status === 404 || status === 410) return this.applyServerStatus('ended', endReason);
      if (status < 200 || status >= 300) return this.scheduleReconnect(sessionId);
      this.openStream(sessionId);
    }, delay);
  }

  parse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;
    const incoming = (snapshot.messages ?? []).map(toClientMessage);
    if (!sameMessages(this.state.messages, incoming)) this.setState({ messages: incoming });
    for (const message of incoming) {
      if (this.seenIds.has(message.id)) continue;
      this.seenIds.add(message.id);
      if (message.sender === 'agent') this.noteAgentMessage(message);
    }
    if (snapshot.session?.status) this.applyServerStatus(snapshot.session.status, snapshot.session.endReason ?? null);
  }

  applyMessage(raw) {
    if (!raw) return;
    const message = toClientMessage(raw);
    if (this.seenIds.has(message.id)) return;
    this.seenIds.add(message.id);
    this.setState({ messages: mergeMessage(this.state.messages, message) });
    if (message.sender === 'agent') this.noteAgentMessage(message);
  }

  noteAgentMessage(message) {
    this.hasReceivedAgentMessage = true;
    this.clearResponseTimer();
    this.callbacks.onAgentMessage?.(message);
  }

  applyServerStatus(status, endReason = null) {
    if (status === 'connected') {
      this.updateStatus('connected');
    } else if (status === 'ended') {
      // Close client-side: a server close alone makes EventSource retry forever.
      this.closeStream();
      this.clearResponseTimer();
      this.setState({ endReason, isAgentTyping: false });
      this.updateStatus('ended');
    }
    // 'waiting' keeps 'connecting'
  }

  // ---- messages
  async sendMessage(content) {
    const { sessionId, status } = this.state;
    if (!sessionId || (status !== 'connected' && status !== 'connecting')) return;
    try {
      const res = await this.fetchImpl(`/api/chat/session/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 404 || res.status === 410) this.applyServerStatus('ended');
    } catch {
      // the stream will tell us if the session is gone
    }
  }

  // ---- end
  async endChat(reason) {
    const sessionId = this.state.sessionId;
    this.clearResponseTimer();
    this.closeStream();
    if (sessionId) {
      try {
        await this.fetchImpl(`/api/chat/session/${encodeURIComponent(sessionId)}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason === 'timeout' ? 'timeout' : undefined }),
        });
      } catch { /* best effort */ }
    }
    this.updateStatus('ended');
    this.setState({ sessionId: null, messages: [] });
    this.seenIds.clear();
    this.hasReceivedAgentMessage = false;
  }

  resetSession() {
    this.clearResponseTimer();
    this.closeStream();
    this.reconnectAttempt = 0;
    this.hasReceivedAgentMessage = false;
    this.seenIds.clear();
    this.setState({ sessionId: null, messages: [], endReason: null, isAgentTyping: false });
  }

  /** Stop network activity and timers. Stays usable (strict mode re-runs effects). */
  dispose() {
    this.clearResponseTimer();
    this.closeStream();
    this.generation += 1;
  }
}
