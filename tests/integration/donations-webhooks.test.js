import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import { pool, query, resetTables, createUser } from '../helpers/db.js';

vi.mock('stripe', () => {
  const singleton = {
    invoices: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    customers: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    paymentIntents: { create: vi.fn(), cancel: vi.fn() },
    subscriptions: { create: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() },
    products: { search: vi.fn(), create: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  };
  function MockStripe() {
    return singleton;
  }
  return { default: MockStripe };
});

vi.mock('../../server/email.js', () => ({
  sendDonationReceipt: vi.fn().mockResolvedValue(true),
  sendDonationFailedNotification: vi.fn().mockResolvedValue(true),
}));

// Access the shared Stripe mock instance (constructor returns singleton).
const stripeMock = new Stripe('anything');

// Import after mocks so module-level `const stripe = new Stripe(...)` uses the mock.
const { processWebhookEvent } = await import('../../server/routes/donations.js');

const RELEVANT_TABLES = ['donations', 'donation_subscriptions', 'stripe_webhook_events', 'users'];

let user;

beforeEach(async () => {
  await resetTables(RELEVANT_TABLES);
  vi.clearAllMocks();
  user = await createUser({ email: 'donor@test.local', name: 'Test Donor' });
});

function pi(overrides = {}) {
  return {
    id: 'pi_test_123',
    amount: 5000,
    currency: 'usd',
    customer: 'cus_test_1',
    metadata: {},
    ...overrides,
  };
}

function invoicePayment(overrides = {}) {
  return {
    invoice: 'in_test_1',
    payment: { type: 'payment_intent', payment_intent: 'pi_test_123' },
    amount_paid: 5000,
    currency: 'usd',
    ...overrides,
  };
}

function event(type, data, id = `evt_${Math.random().toString(36).slice(2)}`) {
  return { id, type, data: { object: data } };
}

async function insertSubscriptionRow({
  subscriptionId = 'sub_test_1',
  customerId = 'cus_test_1',
  interval = 'week',
  status = 'active',
} = {}) {
  const now = Date.now();
  await query(
    `INSERT INTO donation_subscriptions (stripe_subscription_id, stripe_customer_id, user_id, donor_name, donor_email, amount_cents, currency, status, "interval", created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'usd', $7, $8, $9, $9)`,
    [subscriptionId, customerId, user.id, user.name, user.email, 5000, status, interval, now]
  );
}

async function insertPendingDonation({
  piId = 'pi_test_123',
  subscriptionId = null,
  type = 'one_time',
  customerId = 'cus_test_1',
} = {}) {
  const now = Date.now();
  await query(
    `INSERT INTO donations (stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id, user_id, donor_name, donor_email, amount_cents, currency, type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 5000, 'usd', $7, 'pending', $8, $8)`,
    [piId, customerId, subscriptionId, user.id, user.name, user.email, type, now]
  );
}

describe('webhook: payment_intent.succeeded (one-time donations)', () => {
  it('creates a completed donation row when no row exists', async () => {
    await processWebhookEvent(event('payment_intent.succeeded', pi({
      metadata: { donor_name: 'Walk-in Donor', donor_email: 'walkin@test.local', type: 'one_time' },
    })));

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
    expect(rows[0].donor_name).toBe('Walk-in Donor');
    expect(rows[0].donor_email).toBe('walkin@test.local');
    expect(rows[0].type).toBe('one_time');
    expect(rows[0].receipt_number).toMatch(/^ODCC-\d{4}-\d{6}$/);
  });

  it('updates a pre-existing pending row to completed, preserves donor info', async () => {
    await insertPendingDonation();

    await processWebhookEvent(event('payment_intent.succeeded', pi()));

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
    expect(rows[0].donor_name).toBe(user.name);
    expect(rows[0].user_id).toBe(user.id);
  });

  it('falls back to Anonymous when no metadata and no DB row', async () => {
    await processWebhookEvent(event('payment_intent.succeeded', pi()));

    const { rows } = await query('SELECT donor_name, donor_email FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].donor_name).toBe('Anonymous');
    expect(rows[0].donor_email).toBe('');
  });
});

describe('webhook: payment_intent.succeeded (subscription payments — SKIPPED by fix)', () => {
  it('skips when metadata.type=recurring and no DB row (renewal without pre-insert)', async () => {
    // This is the exact scenario that was creating anonymous rows before the fix.
    await processWebhookEvent(event('payment_intent.succeeded', pi({
      metadata: { type: 'recurring' },
    })));

    const { rows } = await query('SELECT * FROM donations');
    expect(rows).toHaveLength(0);
  });

  it('skips when pre-inserted row has stripe_subscription_id (first subscription payment)', async () => {
    await insertPendingDonation({ subscriptionId: 'sub_test_1', type: 'recurring' });

    await processWebhookEvent(event('payment_intent.succeeded', pi()));

    // Row stays pending — invoice_payment.paid will mark it completed later
    const { rows } = await query('SELECT status FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].status).toBe('pending');
  });

  it('does NOT skip for one-time donations with pre-inserted row', async () => {
    await insertPendingDonation({ type: 'one_time', subscriptionId: null });

    await processWebhookEvent(event('payment_intent.succeeded', pi()));

    const { rows } = await query('SELECT status FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].status).toBe('completed');
  });
});

describe('webhook: invoice_payment.paid (subscription payments)', () => {
  it('first payment: updates pre-inserted row to completed with receipt', async () => {
    await insertSubscriptionRow();
    await insertPendingDonation({ subscriptionId: 'sub_test_1', type: 'recurring' });

    await processWebhookEvent(event('invoice_payment.paid', invoicePayment()));

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].status).toBe('completed');
    expect(rows[0].donor_name).toBe(user.name);
    expect(rows[0].receipt_number).toMatch(/^ODCC-\d{4}-\d{6}$/);
  });

  it('renewal: creates full row with donor info looked up from donation_subscriptions', async () => {
    await insertSubscriptionRow();
    stripeMock.invoices.retrieve.mockResolvedValue({
      parent: { subscription_details: { subscription: 'sub_test_1' } },
    });

    await processWebhookEvent(event('invoice_payment.paid', invoicePayment({
      payment: { type: 'payment_intent', payment_intent: 'pi_renewal_2' },
    })));

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_renewal_2']);
    expect(rows).toHaveLength(1);
    expect(rows[0].donor_name).toBe(user.name);
    expect(rows[0].donor_email).toBe(user.email);
    expect(rows[0].user_id).toBe(user.id);
    expect(rows[0].type).toBe('recurring');
    expect(rows[0].stripe_subscription_id).toBe('sub_test_1');
    expect(rows[0].stripe_customer_id).toBe('cus_test_1');
  });

  it('renewal with orphan subscription: inserts anonymous row and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stripeMock.invoices.retrieve.mockResolvedValue({
      parent: { subscription_details: { subscription: 'sub_orphan' } },
    });

    await processWebhookEvent(event('invoice_payment.paid', invoicePayment({
      payment: { type: 'payment_intent', payment_intent: 'pi_orphan_1' },
    })));

    const { rows } = await query('SELECT donor_name, user_id FROM donations WHERE stripe_payment_intent_id = $1', ['pi_orphan_1']);
    expect(rows[0].donor_name).toBe('Anonymous');
    expect(rows[0].user_id).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sub_orphan'));
    warnSpy.mockRestore();
  });

  it('renewal when invoice fetch fails: throws, transaction rolls back, no row inserted', async () => {
    stripeMock.invoices.retrieve.mockRejectedValue(new Error('Stripe API timeout'));

    await expect(
      processWebhookEvent(event('invoice_payment.paid', invoicePayment({
        payment: { type: 'payment_intent', payment_intent: 'pi_fetchfail_1' },
      })))
    ).rejects.toThrow('Stripe API timeout');

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_fetchfail_1']);
    expect(rows).toHaveLength(0);
    const { rows: evts } = await query('SELECT * FROM stripe_webhook_events');
    expect(evts).toHaveLength(0);
  });

  it('mid-deploy healing: reconciles donor fields when existing row is anonymous', async () => {
    // Simulate old code creating a bare anonymous row, then invoice_payment.paid arrives.
    const now = Date.now();
    await query(
      `INSERT INTO donations (stripe_payment_intent_id, donor_name, donor_email, amount_cents, currency, type, status, created_at, updated_at)
       VALUES ($1, 'Anonymous', '', 5000, 'usd', 'one_time', 'completed', $2, $2)`,
      ['pi_midwindow_1', now]
    );
    await insertSubscriptionRow({ subscriptionId: 'sub_midwindow_1' });
    stripeMock.invoices.retrieve.mockResolvedValue({
      parent: { subscription_details: { subscription: 'sub_midwindow_1' } },
    });

    await processWebhookEvent(event('invoice_payment.paid', invoicePayment({
      payment: { type: 'payment_intent', payment_intent: 'pi_midwindow_1' },
    })));

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_midwindow_1']);
    expect(rows[0].donor_name).toBe(user.name);
    expect(rows[0].donor_email).toBe(user.email);
    expect(rows[0].user_id).toBe(user.id);
    expect(rows[0].type).toBe('recurring');
    expect(rows[0].stripe_subscription_id).toBe('sub_midwindow_1');
  });

  it('does NOT re-reconcile when row already has donor info', async () => {
    await insertSubscriptionRow();
    await insertPendingDonation({ subscriptionId: 'sub_test_1', type: 'recurring' });
    // Don't configure stripe.invoices.retrieve — fix should not call it when row looks fine.

    await processWebhookEvent(event('invoice_payment.paid', invoicePayment()));

    expect(stripeMock.invoices.retrieve).not.toHaveBeenCalled();
    const { rows } = await query('SELECT donor_name FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].donor_name).toBe(user.name);
  });

  it('is idempotent: duplicate event ID is skipped (no double-insert)', async () => {
    await insertSubscriptionRow();
    stripeMock.invoices.retrieve.mockResolvedValue({
      parent: { subscription_details: { subscription: 'sub_test_1' } },
    });

    const evt = event('invoice_payment.paid', invoicePayment({
      payment: { type: 'payment_intent', payment_intent: 'pi_dedupe_1' },
    }), 'evt_dedupe_1');

    await processWebhookEvent(evt);
    await processWebhookEvent(evt);  // replay

    const { rows } = await query('SELECT * FROM donations WHERE stripe_payment_intent_id = $1', ['pi_dedupe_1']);
    expect(rows).toHaveLength(1);
    expect(stripeMock.invoices.retrieve).toHaveBeenCalledTimes(1);
  });
});

describe('webhook: other subscription events', () => {
  it('invoice.payment_failed marks subscription past_due', async () => {
    await insertSubscriptionRow();
    await processWebhookEvent(event('invoice.payment_failed', {
      parent: { subscription_details: { subscription: 'sub_test_1' } },
    }));

    const { rows } = await query('SELECT status FROM donation_subscriptions WHERE stripe_subscription_id = $1', ['sub_test_1']);
    expect(rows[0].status).toBe('past_due');
  });

  it('customer.subscription.updated updates status and current_period_end', async () => {
    await insertSubscriptionRow();
    const periodEnd = Math.floor(Date.now() / 1000) + 86400;

    await processWebhookEvent(event('customer.subscription.updated', {
      id: 'sub_test_1',
      status: 'active',
      items: { data: [{ current_period_end: periodEnd }] },
    }));

    const { rows } = await query('SELECT status, current_period_end FROM donation_subscriptions WHERE stripe_subscription_id = $1', ['sub_test_1']);
    expect(rows[0].status).toBe('active');
    expect(Number(rows[0].current_period_end)).toBe(periodEnd * 1000);
  });

  it('customer.subscription.deleted marks canceled with timestamp', async () => {
    await insertSubscriptionRow();

    await processWebhookEvent(event('customer.subscription.deleted', { id: 'sub_test_1' }));

    const { rows } = await query('SELECT status, canceled_at FROM donation_subscriptions WHERE stripe_subscription_id = $1', ['sub_test_1']);
    expect(rows[0].status).toBe('canceled');
    expect(Number(rows[0].canceled_at)).toBeGreaterThan(0);
  });

  it('charge.refunded marks donation refunded', async () => {
    await insertPendingDonation();
    await query(`UPDATE donations SET status='completed' WHERE stripe_payment_intent_id='pi_test_123'`);

    await processWebhookEvent(event('charge.refunded', {
      payment_intent: 'pi_test_123',
    }));

    const { rows } = await query('SELECT status FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].status).toBe('refunded');
  });

  it('payment_intent.payment_failed marks donation failed', async () => {
    await insertPendingDonation();
    await processWebhookEvent(event('payment_intent.payment_failed', pi()));

    const { rows } = await query('SELECT status FROM donations WHERE stripe_payment_intent_id = $1', ['pi_test_123']);
    expect(rows[0].status).toBe('failed');
  });
});
