import { describe, it, expect, vi } from 'vitest';
import {
  LiveChatClient, mergeMessage, sameMessages, backoffDelay, remainingWaitMs,
} from '../../src/lib/live-chat-client.js';

// ---- fakes ------------------------------------------------------------

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, data) {
    for (const fn of this.listeners.get(type) || []) fn({ data: JSON.stringify(data) });
  }
  close() { this.readyState = 2; }
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeClient({ presence = true, escalate, probe } = {}) {
  const streams = [];
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (url === '/api/chat/presence') return jsonResponse(200, { available: presence });
    if (url === '/api/chat/escalate') return escalate ?? jsonResponse(201, { sessionId: 'abc-123', status: 'waiting' });
    if (url.startsWith('/api/chat/session/') && !url.endsWith('/events') && !(init?.method)) {
      return probe ?? jsonResponse(200, { session: { id: 'abc-123', status: 'waiting', createdAt: Date.now() }, messages: [] });
    }
    return jsonResponse(201, { success: true });
  });
  const callbacks = {
    onUnavailable: vi.fn(),
    onConnectionTimeout: vi.fn(),
    onStatusChange: vi.fn(),
    onAgentMessage: vi.fn(),
  };
  const client = new LiveChatClient({
    pageUrl: '/new-here',
    callbacks,
    fetch: fetchImpl,
    createEventSource: (url) => {
      const s = new FakeEventSource(url);
      streams.push(s);
      return s;
    },
    userAgent: () => 'test',
    agentResponseTimeoutMs: 50,
  });
  return { client, callbacks, streams, calls, fetchImpl };
}

// ---- pure helpers ------------------------------------------------------

describe('pure helpers', () => {
  it('mergeMessage inserts by id and ignores duplicates', () => {
    const a = { id: '1', sender: 'user', content: 'a', timestamp: 1 };
    const b = { id: '2', sender: 'agent', content: 'b', timestamp: 2 };
    let list = mergeMessage([], b);
    list = mergeMessage(list, a);
    expect(list.map((m) => m.id)).toEqual(['1', '2']);
    expect(mergeMessage(list, a)).toBe(list);
  });

  it('sameMessages compares length + last id', () => {
    const a = [{ id: '1' }, { id: '2' }];
    expect(sameMessages(a, [{ id: '1' }, { id: '2' }])).toBe(true);
    expect(sameMessages(a, [{ id: '1' }])).toBe(false);
    expect(sameMessages([], [])).toBe(true);
  });

  it('backoffDelay doubles and caps', () => {
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(2000);
    expect(backoffDelay(10)).toBe(30000);
  });

  it('remainingWaitMs floors at 30 s', () => {
    const now = Date.now();
    expect(remainingWaitMs(now, now)).toBe(5 * 60 * 1000);
    expect(remainingWaitMs(now - 10 * 60 * 1000, now)).toBe(30 * 1000);
  });
});

// ---- escalation flow ----------------------------------------------------

describe('LiveChatClient escalation', () => {
  it('503 -> onUnavailable("unavailable"), back to idle, no stream', async () => {
    const { client, callbacks, streams } = makeClient({ escalate: jsonResponse(503, { reason: 'unavailable' }) });
    await client.startEscalation([]);
    expect(callbacks.onUnavailable).toHaveBeenCalledWith('unavailable');
    expect(client.getState().status).toBe('idle');
    expect(streams).toHaveLength(0);
  });

  it('presence=false short-circuits without POSTing', async () => {
    const { client, callbacks, fetchImpl } = makeClient({ presence: false });
    await client.startEscalation([]);
    expect(callbacks.onUnavailable).toHaveBeenCalledWith('unavailable');
    expect(fetchImpl.mock.calls.some(([url]) => url === '/api/chat/escalate')).toBe(false);
  });

  it('400 with requireCaptcha -> reason "verification" (the 2026-10-05 bug class)', async () => {
    const { client, callbacks } = makeClient({ escalate: jsonResponse(400, { error: 'x', requireCaptcha: true }) });
    await client.startEscalation([]);
    expect(callbacks.onUnavailable).toHaveBeenCalledWith('verification');
  });

  it('plain 400 without the flag -> reason "error"', async () => {
    const { client, callbacks } = makeClient({ escalate: jsonResponse(400, { error: 'bad schema' }) });
    await client.startEscalation([]);
    expect(callbacks.onUnavailable).toHaveBeenCalledWith('error');
  });

  it('2xx opens the stream; snapshot replaces messages; connected status flows through', async () => {
    const { client, streams } = makeClient();
    await client.startEscalation([{ role: 'user', content: 'hi' }]);
    expect(client.getState().sessionId).toBe('abc-123');
    expect(client.getState().status).toBe('connecting');
    expect(streams).toHaveLength(1);

    streams[0].dispatch('snapshot', {
      session: { id: 'abc-123', status: 'connected' },
      messages: [{ id: 7, sender: 'agent', content: 'Hello!', created_at: 123 }],
    });
    expect(client.getState().status).toBe('connected');
    expect(client.getState().messages).toHaveLength(1);
    expect(client.getState().messages[0].sender).toBe('agent');
  });

  it('5-minute timer fires onConnectionTimeout only when no agent message arrived', async () => {
    const { client, callbacks, streams } = makeClient();
    await client.startEscalation([]);
    streams[0].dispatch('message', { id: 1, sender: 'agent', content: 'hi', created_at: 1 });
    await new Promise((r) => setTimeout(r, 80));
    expect(callbacks.onConnectionTimeout).not.toHaveBeenCalled();

    const second = makeClient();
    await second.client.startEscalation([]);
    await new Promise((r) => setTimeout(r, 80));
    expect(second.callbacks.onConnectionTimeout).toHaveBeenCalled();
  });

  it('server "ended" status closes the stream and sets endReason', async () => {
    const { client, streams } = makeClient();
    await client.startEscalation([]);
    streams[0].dispatch('status', { sessionId: 'abc-123', status: 'ended', endReason: 'agent_ended' });
    expect(client.getState().status).toBe('ended');
    expect(client.getState().endReason).toBe('agent_ended');
    expect(streams[0].readyState).toBe(2);
  });
});

describe('LiveChatClient resume', () => {
  it('reattaches to a waiting session and re-arms a shortened timer', async () => {
    const createdAt = Date.now() - 1000;
    const { client, streams } = makeClient({
      probe: jsonResponse(200, {
        session: { id: 'abc-123', status: 'waiting', createdAt },
        messages: [{ id: 3, sender: 'user', content: 'anyone?', created_at: 5 }],
      }),
    });
    const result = await client.resume('abc-123');
    expect(result.status).toBe('waiting');
    expect(client.getState().status).toBe('connecting');
    expect(client.getState().messages).toHaveLength(1);
    expect(streams).toHaveLength(1);
    client.dispose(); // clears the re-armed (30 s floor) wait timer
  });

  it('returns the end reason for an ended session and does not open a stream', async () => {
    const { client, streams } = makeClient({
      probe: jsonResponse(200, { session: { id: 'abc-123', status: 'ended', endReason: 'timeout', createdAt: 1 }, messages: [] }),
    });
    const result = await client.resume('abc-123');
    expect(result).toEqual({ status: 'ended', endReason: 'timeout' });
    expect(streams).toHaveLength(0);
  });

  it('returns null for a 410 (gone) session', async () => {
    const { client } = makeClient({ probe: jsonResponse(410, { error: 'gone' }) });
    expect(await client.resume('abc-123')).toBe(null);
  });
});
