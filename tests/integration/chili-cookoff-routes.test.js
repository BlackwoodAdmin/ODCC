import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

// Keep SendGrid out of the test run; the route only imports these two.
vi.mock('../../server/email.js', () => ({
  sendChiliCookoffConfirmation: vi.fn().mockResolvedValue(true),
  sendChiliCookoffNotification: vi.fn().mockResolvedValue(true),
}));

const emailMod = await import('../../server/email.js');
const { default: chiliRoutes, divisionForAge } = await import('../../server/routes/chili-cookoff.js');

// Mounted with the origin check like production; tests send no Origin header,
// which the lenient check allows.
const app = buildTestApp({ routes: { '/api/chili-cookoff': { router: chiliRoutes, originCheck: true } } });

const VALID = {
  cook_first_name: 'Maya',
  age: 9,
  chili_name: 'Volcano Chili',
  parent_name: 'Jordan Rivera',
  parent_email: 'Jordan@Example.com',
  parent_phone: '386-555-0100',
  notes: 'Mild, no nuts',
  consent: true,
};

let admin, subscriber;

async function setSettings(patch) {
  await query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('chili_cookoff', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(patch), Date.now()]
  );
}

const post = (body) => request(app).post('/api/chili-cookoff/entries').send(body);

beforeEach(async () => {
  await resetTables(['chili_cookoff_entries', 'site_settings', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
  subscriber = await createUser({ email: 'sub@test.local', role: 'subscriber' });
  emailMod.sendChiliCookoffConfirmation.mockClear();
  emailMod.sendChiliCookoffNotification.mockClear();
});

describe('divisionForAge', () => {
  it('splits at 12/13', () => {
    expect(divisionForAge(7)).toBe('junior');
    expect(divisionForAge(12)).toBe('junior');
    expect(divisionForAge(13)).toBe('teen');
    expect(divisionForAge(19)).toBe('teen');
  });
});

describe('GET /api/chili-cookoff/status', () => {
  it('is open by default with the flyer deadline', async () => {
    const res = await request(app).get('/api/chili-cookoff/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ open: true, reason: null, count: 0, capacity: null });
    expect(res.body.deadline).toBe('2026-10-12T23:59:59-04:00');
  });
});

describe('POST /api/chili-cookoff/entries', () => {
  it('registers a cook, normalizes the email, assigns the division, and sends both emails', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, division: 'junior' });

    const { rows } = await query('SELECT * FROM chili_cookoff_entries');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cook_first_name: 'Maya', age: 9, division: 'junior', chili_name: 'Volcano Chili',
      parent_name: 'Jordan Rivera', parent_email: 'jordan@example.com', parent_phone: '386-555-0100',
      notes: 'Mild, no nuts', source: 'online', entry_number: null, checked_in_at: null,
    });

    expect(emailMod.sendChiliCookoffConfirmation).toHaveBeenCalledTimes(1);
    expect(emailMod.sendChiliCookoffConfirmation.mock.calls[0][0]).toMatchObject({ to: 'jordan@example.com', cookName: 'Maya', division: 'junior' });
    expect(emailMod.sendChiliCookoffNotification).toHaveBeenCalledTimes(1);
    expect(emailMod.sendChiliCookoffNotification.mock.calls[0][0].to).toBe('hello@opendoorchristian.church');
  });

  it('puts a 13-year-old in the teen division', async () => {
    const res = await post({ ...VALID, age: '13' });
    expect(res.status).toBe(201);
    expect(res.body.division).toBe('teen');
  });

  it.each([
    ['age 6', { age: 6 }],
    ['age 20', { age: 20 }],
    ['age text', { age: 'nine' }],
    ['missing cook name', { cook_first_name: '  ' }],
    ['missing chili name', { chili_name: '' }],
    ['bad email', { parent_email: 'not-an-email' }],
    ['no consent', { consent: false }],
    ['notes too long', { notes: 'x'.repeat(501) }],
    ['phone too long', { parent_phone: '1'.repeat(21) }],
  ])('rejects %s with 400', async (_label, override) => {
    const res = await post({ ...VALID, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM chili_cookoff_entries');
    expect(rows[0].n).toBe(0);
  });

  it('rejects the same cook under the same email, case-insensitively', async () => {
    expect((await post(VALID)).status).toBe(201);
    const dup = await post({ ...VALID, cook_first_name: 'MAYA', parent_email: 'JORDAN@example.com', chili_name: 'Second try' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already registered/i);
    // A sibling under the same parent is fine.
    expect((await post({ ...VALID, cook_first_name: 'Leo', age: 14 })).status).toBe(201);
  });

  it('refuses when an admin has closed registration', async () => {
    await setSettings({ registration_open: false });
    const res = await post(VALID);
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('closed');
  });

  it('refuses after the deadline', async () => {
    await setSettings({ deadline: '2020-01-01T00:00:00Z' });
    const res = await post(VALID);
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('deadline');
    expect(res.body.error).toMatch(/walk-ins/i);
  });

  it('refuses when capacity is reached', async () => {
    await setSettings({ capacity: 1 });
    expect((await post(VALID)).status).toBe(201);
    const res = await post({ ...VALID, cook_first_name: 'Leo' });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('full');
    const status = await request(app).get('/api/chili-cookoff/status');
    expect(status.body).toMatchObject({ open: false, reason: 'full', count: 1, capacity: 1 });
  });
});

describe('admin routes', () => {
  const adminGet = (url) => request(app).get(url).set(authHeader(admin));

  it('require an admin token', async () => {
    expect((await request(app).get('/api/chili-cookoff/entries')).status).toBe(401);
    expect((await request(app).get('/api/chili-cookoff/entries').set(authHeader(subscriber))).status).toBe(403);
    expect((await request(app).put('/api/chili-cookoff/settings').set(authHeader(subscriber)).send({})).status).toBe(403);
    expect((await request(app).get('/api/chili-cookoff/entries/export.csv').set(authHeader(subscriber))).status).toBe(403);
  });

  it('lists entries with counts and supports division/search filters', async () => {
    await post(VALID);
    await post({ ...VALID, cook_first_name: 'Leo', age: 15, chili_name: 'Smoky Joe' });
    const all = await adminGet('/api/chili-cookoff/entries');
    expect(all.status).toBe(200);
    expect(all.body.entries).toHaveLength(2);
    expect(all.body.counts).toEqual({ total: 2, junior: 1, teen: 1, checked_in: 0 });

    const teens = await adminGet('/api/chili-cookoff/entries?division=teen');
    expect(teens.body.entries.map((e) => e.cook_first_name)).toEqual(['Leo']);
    const search = await adminGet('/api/chili-cookoff/entries?q=volcano');
    expect(search.body.entries.map((e) => e.cook_first_name)).toEqual(['Maya']);
  });

  it('adds walk-ins even when registration is closed, without consent', async () => {
    await setSettings({ registration_open: false });
    const { consent, ...noConsent } = VALID;
    const res = await request(app).post('/api/chili-cookoff/entries/walkin').set(authHeader(admin)).send(noConsent);
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ source: 'walkin', division: 'junior' });
    expect(emailMod.sendChiliCookoffConfirmation).not.toHaveBeenCalled();
  });

  it('edits an entry and re-derives the division', async () => {
    const created = await post(VALID);
    const id = created.body.id;
    const res = await request(app).put(`/api/chili-cookoff/entries/${id}`).set(authHeader(admin))
      .send({ ...VALID, age: 13, chili_name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({ id, age: 13, division: 'teen', chili_name: 'Renamed' });
    expect((await request(app).put('/api/chili-cookoff/entries/999999').set(authHeader(admin)).send(VALID)).status).toBe(404);
  });

  it('check-in numbers entries 1, 2, 3 within a division and is idempotent; undo clears it', async () => {
    const ids = [];
    for (const [name, age] of [['A', 8], ['B', 9], ['C', 16], ['D', 10]]) {
      ids.push((await post({ ...VALID, cook_first_name: name, age })).body.id);
    }
    const checkIn = (id) => request(app).put(`/api/chili-cookoff/entries/${id}/check-in`).set(authHeader(admin));

    expect((await checkIn(ids[1])).body.entry.entry_number).toBe(1); // B, junior
    expect((await checkIn(ids[0])).body.entry.entry_number).toBe(2); // A, junior
    expect((await checkIn(ids[2])).body.entry.entry_number).toBe(1); // C, teen — separate sequence
    expect((await checkIn(ids[3])).body.entry.entry_number).toBe(3); // D, junior
    const again = await checkIn(ids[1]);
    expect(again.body.entry.entry_number).toBe(1);
    expect(again.body.entry.checked_in_at).not.toBeNull();

    const undo = await request(app).put(`/api/chili-cookoff/entries/${ids[1]}/undo-check-in`).set(authHeader(admin));
    expect(undo.body.entry).toMatchObject({ entry_number: null, checked_in_at: null });

    const list = await adminGet('/api/chili-cookoff/entries');
    expect(list.body.counts.checked_in).toBe(3);
  });

  it('exports CSV with a BOM and one row per entry', async () => {
    await post(VALID);
    await post({ ...VALID, cook_first_name: 'Leo', age: 15, chili_name: 'Say "hi", chili' });
    const res = await adminGet('/api/chili-cookoff/entries/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Entry #,Division,Cook,Age,Chili/);
    expect(text).toContain('"Say ""hi"", chili"');
  });

  it('deletes one entry, and deletes all only with the confirmation word', async () => {
    const a = (await post(VALID)).body.id;
    await post({ ...VALID, cook_first_name: 'Leo' });
    expect((await request(app).delete(`/api/chili-cookoff/entries/${a}`).set(authHeader(admin))).status).toBe(200);
    expect((await request(app).delete('/api/chili-cookoff/entries').set(authHeader(admin)).send({})).status).toBe(400);
    const all = await request(app).delete('/api/chili-cookoff/entries').set(authHeader(admin)).send({ confirm: 'DELETE' });
    expect(all.status).toBe(200);
    expect(all.body.deleted).toBe(1);
    expect((await query('SELECT COUNT(*)::int AS n FROM chili_cookoff_entries')).rows[0].n).toBe(0);
  });

  it('reads and updates settings with validation', async () => {
    const before = await adminGet('/api/chili-cookoff/settings');
    expect(before.body.settings).toMatchObject({ registration_open: true, capacity: null });

    const bad = await request(app).put('/api/chili-cookoff/settings').set(authHeader(admin)).send({ capacity: -3 });
    expect(bad.status).toBe(400);
    const bad2 = await request(app).put('/api/chili-cookoff/settings').set(authHeader(admin)).send({ deadline: 'next tuesday' });
    expect(bad2.status).toBe(400);

    const ok = await request(app).put('/api/chili-cookoff/settings').set(authHeader(admin))
      .send({ registration_open: false, capacity: 25, deadline: '2026-10-13T03:59:59.000Z' });
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toEqual({ registration_open: false, capacity: 25, deadline: '2026-10-13T03:59:59.000Z' });
    expect(ok.body.status).toMatchObject({ open: false, reason: 'closed' });

    const reopened = await request(app).put('/api/chili-cookoff/settings').set(authHeader(admin)).send({ registration_open: true, capacity: '' });
    expect(reopened.body.settings.capacity).toBeNull();
    expect(reopened.body.status.open).toBe(true);
  });
});
