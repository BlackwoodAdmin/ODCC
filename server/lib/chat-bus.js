// In-process fan-out for live chat. All chat writes go through this one Node
// process, so a plain registry of SSE responses delivers the same events the
// reference implementation routes through pg_notify — with none of the
// trigger/LISTEN/watchdog machinery. The DB stays the source of truth; this is
// delivery only.
//
// NOTE deliberately NO process.on('SIGTERM') here: this app registers no
// SIGTERM handler anywhere, so systemd's SIGTERM terminates the process
// immediately and deploys stay fast. Dying sockets are exactly the restart
// case the client's snapshot/reconnect design heals. If a handler is ever
// added, it MUST end with process.exit(0) or every deploy hangs for
// TimeoutStopSec.

const KEEPALIVE_MS = 20 * 1000;
export const MAX_SSE_CLIENTS = 200;

// sessionId -> Set<res> for visitor streams; a flat Set for the admin console.
const visitorStreams = new Map();
const adminStreams = new Set();

export function totalStreams() {
  let n = adminStreams.size;
  for (const set of visitorStreams.values()) n += set.size;
  return n;
}

export function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/** Shared SSE bootstrap: headers, retry hint, keep-alive, close cleanup.
 *  Returns false (after answering 503) when the global cap is reached. */
export function openSseStream(req, res, { onClose } = {}) {
  if (totalStreams() >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: 'Too many open streams. Try again shortly.' });
    return false;
  }
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    // Override the global /api no-store; no-transform is load-bearing under
    // compressing proxies.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  const keepalive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      cleanup();
    }
  }, KEEPALIVE_MS);

  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    onClose?.();
    try { res.end(); } catch { /* already gone */ }
  }
  req.on('close', cleanup);
  res.on('close', cleanup);
  return true;
}

export function addVisitorStream(sessionId, res) {
  let set = visitorStreams.get(sessionId);
  if (!set) {
    set = new Set();
    visitorStreams.set(sessionId, set);
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (set.size === 0) visitorStreams.delete(sessionId);
  };
}

export function addAdminStream(res) {
  adminStreams.add(res);
  return () => adminStreams.delete(res);
}

function broadcast(set, event, data) {
  for (const res of Array.from(set)) {
    if (!writeEvent(res, event, data)) set.delete(res);
  }
}

/** New chat message: to that session's visitor streams + the console. */
export function publishMessage(message) {
  const set = visitorStreams.get(message.session_id);
  if (set) broadcast(set, 'message', message);
  broadcast(adminStreams, 'message', message);
}

/** Session status change (connected / ended): same fan-out. */
export function publishStatus(sessionId, status, endReason = null) {
  const payload = { sessionId, status, endReason };
  const set = visitorStreams.get(sessionId);
  if (set) broadcast(set, 'status', payload);
  broadcast(adminStreams, 'status', payload);
}

/** New waiting session: console only (the visitor who created it knows). */
export function publishSessionCreated(session) {
  broadcast(adminStreams, 'session-created', session);
}

/** Presence toggle: everyone — visitors update their "talk to a person" UI. */
export function publishPresence(available) {
  const payload = { available };
  for (const set of visitorStreams.values()) broadcast(set, 'presence', payload);
  broadcast(adminStreams, 'presence', payload);
}
