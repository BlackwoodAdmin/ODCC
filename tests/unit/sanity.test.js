import { describe, it, expect } from 'vitest';
import { query } from '../../server/db.js';

describe('test harness sanity', () => {
  it('connects to the test database', async () => {
    const { rows } = await query('SELECT current_database() AS db');
    expect(rows[0].db).toBe('odcc_test');
  });

  it('has JWT_SECRET loaded from .env.test', () => {
    expect(process.env.JWT_SECRET?.length).toBeGreaterThanOrEqual(64);
  });

  it('has schema initialized', async () => {
    const { rows } = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','donations','donation_subscriptions','stripe_webhook_events')`);
    expect(rows.length).toBe(4);
  });
});
