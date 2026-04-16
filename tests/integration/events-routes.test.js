import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { query, resetTables, createUser } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { buildTestApp } from '../helpers/app.js';

const { default: eventsRoutes } = await import('../../server/routes/events.js');

const app = buildTestApp({ routes: { '/api/events': { router: eventsRoutes } } });

let admin, contributor, other;

beforeEach(async () => {
  await resetTables(['events', 'users']);
  admin = await createUser({ email: 'admin@test.local', role: 'admin' });
  contributor = await createUser({ email: 'contributor@test.local', role: 'contributor' });
  other = await createUser({ email: 'other@test.local', role: 'contributor' });
});

async function insertEvent({
  title = 'Event',
  event_date,
  end_date = event_date,
  recurrence = null,
  day_of_week = null,
  week_of_month = null,
  author_id,
  event_time = null,
}) {
  const now = Date.now();
  const { rows } = await query(
    `INSERT INTO events (title, description, location, event_date, event_time, end_date, recurrence, day_of_week, week_of_month, author_id, created_at, updated_at)
     VALUES ($1, 'desc', 'loc', $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
    [title, event_date, event_time, end_date, recurrence, day_of_week, week_of_month, author_id, now]
  );
  return rows[0];
}

describe('GET /api/events', () => {
  it('returns a one-time event within the requested month window', async () => {
    await insertEvent({ author_id: admin.id, title: 'April 8', event_date: '2026-04-08' });
    const res = await request(app).get('/api/events?month=4&year=2026');
    expect(res.status).toBe(200);
    const titles = res.body.events.map(e => e.title);
    expect(titles).toContain('April 8');
  });

  it('preserves the calendar date for one-time events (no UTC-to-ET shift)', async () => {
    // Regression: 4/8 events were displaying as 4/7 because of UTC midnight parsing
    await insertEvent({ author_id: admin.id, title: 'April 8', event_date: '2026-04-08' });
    const res = await request(app).get('/api/events?month=4&year=2026');
    const event = res.body.events.find(e => e.title === 'April 8');
    expect(event).toBeTruthy();
    expect(event.event_date).toBe('2026-04-08');
  });

  it('expands a weekly recurring event into multiple occurrences', async () => {
    // Every Sunday (day_of_week = 0)
    await insertEvent({
      author_id: admin.id,
      title: 'Sunday Service',
      event_date: '2026-04-05',
      recurrence: 'weekly',
      day_of_week: 0,
    });

    const res = await request(app).get('/api/events?month=4&year=2026');
    const sundays = res.body.events.filter(e => e.title === 'Sunday Service');
    // April 2026 Sundays in the calendar grid window: 4/5, 4/12, 4/19, 4/26 (possibly 3/29 and 5/3)
    expect(sundays.length).toBeGreaterThanOrEqual(4);
    for (const occ of sundays) {
      // Every returned date should fall on a Sunday when parsed as UTC
      const dow = new Date(occ.event_date + 'T12:00:00Z').getUTCDay();
      expect(dow).toBe(0);
    }
  });

  it('expands a monthly "nth weekday" recurring event', async () => {
    // First Saturday (day_of_week=6, week=1)
    await insertEvent({
      author_id: admin.id,
      title: 'First Saturday',
      event_date: '2026-04-04',
      recurrence: 'monthly',
      day_of_week: 6,
      week_of_month: 1,
    });

    const res = await request(app).get('/api/events?month=4&year=2026');
    const firstSats = res.body.events.filter(e => e.title === 'First Saturday');
    expect(firstSats.length).toBeGreaterThanOrEqual(1);
    expect(firstSats[0].event_date).toBe('2026-04-04');
  });
});

describe('GET /api/events/all', () => {
  it('admin sees all events', async () => {
    await insertEvent({ author_id: admin.id, title: 'A', event_date: '2026-04-10' });
    await insertEvent({ author_id: contributor.id, title: 'B', event_date: '2026-04-11' });

    const res = await request(app).get('/api/events/all').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
  });

  it('contributor only sees their own events', async () => {
    await insertEvent({ author_id: admin.id, title: 'A', event_date: '2026-04-10' });
    await insertEvent({ author_id: contributor.id, title: 'Mine', event_date: '2026-04-11' });

    const res = await request(app).get('/api/events/all').set(authHeader(contributor));
    expect(res.body.events.map(e => e.title)).toEqual(['Mine']);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/events/all');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/events', () => {
  it('creates an event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set(authHeader(admin))
      .send({
        title: 'New', description: 'd', location: 'l',
        event_date: '2026-05-01', event_time: '18:00',
      });
    expect(res.status).toBe(201);
    expect(res.body.event.title).toBe('New');
    expect(res.body.event.author_id).toBe(admin.id);
  });

  it('rejects subscribers', async () => {
    const sub = await createUser({ email: 'sub@test.local', role: 'subscriber' });
    const res = await request(app)
      .post('/api/events')
      .set(authHeader(sub))
      .send({ title: 'x', event_date: '2026-05-01' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/events/:id', () => {
  it('contributor can edit their own event', async () => {
    const ev = await insertEvent({ author_id: contributor.id, event_date: '2026-05-01' });
    const res = await request(app)
      .put(`/api/events/${ev.id}`)
      .set(authHeader(contributor))
      .send({ title: 'Edited', description: 'd', location: 'l', event_date: '2026-05-01', event_time: null, end_date: '2026-05-01', end_time: null });
    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe('Edited');
  });

  it('contributor cannot edit someone else’s event', async () => {
    const ev = await insertEvent({ author_id: other.id, event_date: '2026-05-01' });
    const res = await request(app)
      .put(`/api/events/${ev.id}`)
      .set(authHeader(contributor))
      .send({ title: 'hack', event_date: '2026-05-01', end_date: '2026-05-01', description: 'd', location: 'l', event_time: null, end_time: null });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown event', async () => {
    const res = await request(app)
      .put('/api/events/999999')
      .set(authHeader(admin))
      .send({ title: 'x', event_date: '2026-05-01' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/events/:id', () => {
  it('admin can delete an event', async () => {
    const ev = await insertEvent({ author_id: admin.id, event_date: '2026-05-01' });
    const res = await request(app).delete(`/api/events/${ev.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT id FROM events WHERE id=$1', [ev.id]);
    expect(rows).toHaveLength(0);
  });

  it('contributor cannot delete', async () => {
    const ev = await insertEvent({ author_id: contributor.id, event_date: '2026-05-01' });
    const res = await request(app).delete(`/api/events/${ev.id}`).set(authHeader(contributor));
    expect(res.status).toBe(403);
  });
});
