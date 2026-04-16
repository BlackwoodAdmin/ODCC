import { Router } from 'express';
import Stripe from 'stripe';
import { query, pool } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../middleware/auth.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { sendDonationReceipt, sendDonationFailedNotification } from '../email.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// --- Cached Stripe product for recurring donations ---
let donationProductId = null;

async function getDonationProductId() {
  if (donationProductId) return donationProductId;
  if (!stripe) return null;

  // Search for existing product by metadata
  const products = await stripe.products.search({ query: "metadata['odcc_type']:'donation'" });
  if (products.data.length > 0) {
    donationProductId = products.data[0].id;
    return donationProductId;
  }

  // Create one
  const product = await stripe.products.create({
    name: 'Recurring Donation to ODCC',
    metadata: { odcc_type: 'donation' },
  });
  donationProductId = product.id;
  return donationProductId;
}

// --- Rate limiting for payment intent creation ---
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

// --- Validation helpers ---
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

const VALID_INTERVALS = ['week', 'month'];

export function validateDonationInput({ amount, type, name, email, note, frequency }) {
  const errors = [];
  if (!amount || !AMOUNT_REGEX.test(String(amount))) {
    errors.push('Amount must be a valid dollar amount (e.g. 50 or 50.00)');
  } else {
    const num = Number(amount);
    if (!isFinite(num) || num < 1 || num > 50000) {
      errors.push('Amount must be between $1.00 and $50,000.00');
    }
  }
  if (!type || !['one_time', 'recurring'].includes(type)) {
    errors.push('Type must be one_time or recurring');
  }
  if (type === 'recurring' && frequency && !VALID_INTERVALS.includes(frequency)) {
    errors.push('Frequency must be week or month');
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required');
  } else if (name.trim().length > 255) {
    errors.push('Name must be 255 characters or less');
  }
  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    errors.push('A valid email is required');
  } else if (email.trim().length > 255) {
    errors.push('Email must be 255 characters or less');
  }
  if (note !== undefined && note !== null && note !== '') {
    if (typeof note !== 'string') errors.push('Note must be a string');
    else if (note.trim().length > 500) errors.push('Note must be 500 characters or less');
  }
  return errors;
}

// --- Generate receipt number ---
export function generateReceiptNumber(donationId) {
  const year = new Date().getFullYear();
  return `ODCC-${year}-${String(donationId).padStart(6, '0')}`;
}

// --- Helper: extract subscription ID from invoice parent (Stripe API 2025+) ---
export function getSubscriptionIdFromInvoice(invoice) {
  return invoice.parent?.subscription_details?.subscription || null;
}

// ============================================================
// POST /api/donations/create-payment-intent
// ============================================================
router.post('/create-payment-intent', requireTurnstile, optionalAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Donations are not configured' });

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { amount, type, name, email, note, frequency } = req.body;
  const interval = type === 'recurring' ? (frequency || 'month') : null;
  const errors = validateDonationInput({ amount, type, name, email, note, frequency });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedNote = note ? note.trim() : null;
  const amountCents = Math.round(Number(amount) * 100);

  // Recurring requires auth
  if (type === 'recurring' && !req.user) {
    return res.status(401).json({
      error: 'To set up recurring giving, please create an account or log in so you can manage your subscription later.',
    });
  }

  const donorName = req.user ? (req.user.name || trimmedName) : trimmedName;
  const donorEmail = req.user ? (req.user.email || trimmedEmail) : trimmedEmail;
  const userId = req.user ? req.user.id : null;

  try {
    // Find or create Stripe customer
    const existing = await stripe.customers.list({ email: donorEmail, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
      // Update name if different
      if (customer.name !== donorName) {
        await stripe.customers.update(customer.id, { name: donorName });
      }
    } else {
      customer = await stripe.customers.create(
        { email: donorEmail, name: donorName },
        { idempotencyKey: `create-customer-${donorEmail}` }
      );
    }

    const metadata = {
      donor_name: donorName,
      donor_email: donorEmail,
      user_id: userId ? String(userId) : '',
      note: trimmedNote || '',
      type,
    };

    const now = Date.now();

    if (type === 'one_time') {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: customer.id,
        metadata,
      });

      await query(
        `INSERT INTO donations (stripe_payment_intent_id, stripe_customer_id, user_id, donor_name, donor_email, amount_cents, currency, type, status, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'usd', 'one_time', 'pending', $7, $8, $8)`,
        [paymentIntent.id, customer.id, userId, donorName, donorEmail, amountCents, trimmedNote, now]
      );

      return res.json({ clientSecret: paymentIntent.client_secret });
    }

    // Recurring — Stripe API 2025+ uses confirmation_secret + payments array
    const productId = await getDonationProductId();
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          unit_amount: amountCents,
          currency: 'usd',
          recurring: { interval },
          product: productId,
        },
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payments'],
      metadata,
    });

    const invoice = subscription.latest_invoice;
    const clientSecret = invoice.confirmation_secret?.client_secret;
    if (!clientSecret) {
      throw new Error('Subscription created but no confirmation secret was generated');
    }

    // Get payment intent ID from invoice payments array
    const piId = invoice.payments?.data?.[0]?.payment?.payment_intent;
    if (!piId) {
      throw new Error('Subscription created but no payment intent was generated');
    }

    await query(
      `INSERT INTO donation_subscriptions (stripe_subscription_id, stripe_customer_id, user_id, donor_name, donor_email, amount_cents, currency, status, "interval", created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'usd', 'incomplete', $7, $8, $8)`,
      [subscription.id, customer.id, userId, donorName, donorEmail, amountCents, interval, now]
    );

    await query(
      `INSERT INTO donations (stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id, user_id, donor_name, donor_email, amount_cents, currency, type, status, note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'usd', 'recurring', 'pending', $8, $9, $9)`,
      [piId, customer.id, subscription.id, userId, donorName, donorEmail, amountCents, trimmedNote, now]
    );

    return res.json({
      clientSecret,
      subscriptionId: subscription.id,
    });
  } catch (err) {
    console.error('[Donations] create-payment-intent error:', err.message);
    return res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  }
});

// ============================================================
// POST /api/donations/webhook
// ============================================================
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(200).json({ received: true });

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Donations] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    await processWebhookEvent(event);
  } catch (err) {
    // Log but still return 200 — don't cause Stripe retries
    console.error(`[Donations] Webhook processing error for ${event.type}:`, err.message);
  }

  return res.status(200).json({ received: true });
});

export async function processWebhookEvent(event) {
  const now = Date.now();

  // Transactional idempotency: insert event + process in one transaction
  const txClient = await pool.connect();

  try {
    await txClient.query('BEGIN');

    // Idempotency check
    try {
      await txClient.query(
        'INSERT INTO stripe_webhook_events (stripe_event_id, event_type, processed_at) VALUES ($1, $2, $3)',
        [event.id, event.type, now]
      );
    } catch (err) {
      // Duplicate event — skip
      if (err.code === '23505') {
        await txClient.query('ROLLBACK');
        return;
      }
      throw err;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(txClient, event.data.object, now);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(txClient, event.data.object, now);
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(txClient, event.data.object, now);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(txClient, event.data.object, now);
        break;
      case 'invoice_payment.paid':
        await handleInvoicePaymentPaid(txClient, event.data.object, now);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(txClient, event.data.object, now);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(txClient, event.data.object, now);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(txClient, event.data.object, now);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(txClient, event.data.object, now);
        break;
    }

    await txClient.query('COMMIT');
  } catch (err) {
    await txClient.query('ROLLBACK');
    throw err;
  } finally {
    txClient.release();
  }
}

async function handlePaymentIntentSucceeded(txClient, pi, now) {
  const meta = pi.metadata || {};
  const amountCents = pi.amount;
  const currency = pi.currency || 'usd';

  // For recurring donations, Stripe 2025+ API does not copy subscription metadata
  // to the payment intent. Fall back to the existing DB row (created by create-payment-intent).
  const existingRow = await txClient.query(
    'SELECT donor_name, donor_email, user_id, note, type, stripe_subscription_id FROM donations WHERE stripe_payment_intent_id = $1',
    [pi.id]
  );
  const dbRow = existingRow.rows[0];

  // Subscription payments are recorded exclusively via invoice_payment.paid.
  // Early-return here prevents creating anonymous rows on renewals (where meta
  // and dbRow are both empty) and avoids a redundant write on first payments.
  if (meta.type === 'recurring' || dbRow?.stripe_subscription_id) return;

  const donorName = meta.donor_name || dbRow?.donor_name || 'Anonymous';
  const donorEmail = meta.donor_email || dbRow?.donor_email || '';
  const userId = meta.user_id ? parseInt(meta.user_id) : (dbRow?.user_id || null);
  const note = meta.note || dbRow?.note || null;
  const type = meta.type || dbRow?.type || 'one_time';

  const result = await txClient.query(
    `INSERT INTO donations (stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id, user_id, donor_name, donor_email, amount_cents, currency, type, status, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11, $11)
     ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
       status = 'completed',
       amount_cents = EXCLUDED.amount_cents,
       currency = EXCLUDED.currency,
       updated_at = EXCLUDED.updated_at
     RETURNING id, receipt_number`,
    [pi.id, pi.customer, meta.subscription_id || dbRow?.stripe_subscription_id || null, userId, donorName, donorEmail, amountCents, currency, type, note, now]
  );

  const donation = result.rows[0];
  if (!donation.receipt_number) {
    const receiptNumber = generateReceiptNumber(donation.id);
    await txClient.query(
      'UPDATE donations SET receipt_number = $1, receipt_sent = FALSE WHERE id = $2',
      [receiptNumber, donation.id]
    );
    // Look up subscription interval for receipt
    const subscriptionId = meta.subscription_id || dbRow?.stripe_subscription_id || null;
    let frequency = null;
    if (subscriptionId) {
      const subRow = await txClient.query('SELECT "interval" FROM donation_subscriptions WHERE stripe_subscription_id = $1', [subscriptionId]);
      frequency = subRow.rows[0]?.interval || null;
    }
    // Send receipt after commit (best effort)
    if (donorEmail) {
      setImmediate(() => {
        sendDonationReceipt({
          to: donorEmail,
          donorName,
          amount: (amountCents / 100).toFixed(2),
          receiptNumber,
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          note,
          isRecurring: type === 'recurring',
          frequency,
        }).then(sent => {
          if (sent) query('UPDATE donations SET receipt_sent = TRUE WHERE id = $1', [donation.id]);
        }).catch(() => {});
      });
    }
  }
}

async function handlePaymentIntentFailed(txClient, pi, now) {
  await txClient.query(
    `UPDATE donations SET status = 'failed', updated_at = $1 WHERE stripe_payment_intent_id = $2`,
    [now, pi.id]
  );
}

async function handlePaymentIntentCanceled(txClient, pi, now) {
  await txClient.query(
    `UPDATE donations SET status = 'canceled', updated_at = $1 WHERE stripe_payment_intent_id = $2`,
    [now, pi.id]
  );
}

// Stripe API 2025+: invoice.paid — update subscription status
// payment_intent field removed; payment recording handled by invoice_payment.paid
async function handleInvoicePaid(txClient, invoice, now) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  // Mark subscription as active
  await txClient.query(
    `UPDATE donation_subscriptions SET status = 'active', updated_at = $1 WHERE stripe_subscription_id = $2`,
    [now, subscriptionId]
  );
}

// Stripe API 2025+: invoice_payment.paid — primary handler for recording completed payments
// Structure: { invoice: "in_...", payment: { type, payment_intent: "pi_..." }, amount_paid, currency }
async function handleInvoicePaymentPaid(txClient, invoicePayment, now) {
  const payment = invoicePayment.payment || {};
  const piId = typeof payment === 'string' ? null : payment.payment_intent;
  if (!piId) return;

  const amountCents = invoicePayment.amount_paid ?? 0;
  const currency = invoicePayment.currency || 'usd';

  // Check if donation row already exists (created during create-payment-intent for first payment)
  const existing = await txClient.query(
    'SELECT id, stripe_subscription_id, stripe_customer_id, donor_name, donor_email, user_id, amount_cents FROM donations WHERE stripe_payment_intent_id = $1',
    [piId]
  );

  if (existing.rows.length > 0) {
    // Row exists — update to completed, and reconcile donor info if row is anonymous
    // (handles mid-deploy window where payment_intent.succeeded created a bare row).
    const row = existing.rows[0];
    const finalAmount = amountCents || row.amount_cents;

    const isAnonymous = !row.user_id || row.donor_name === 'Anonymous' || !row.donor_email;
    let reconciled = null;
    if (isAnonymous && invoicePayment.invoice) {
      const inv = await stripe.invoices.retrieve(invoicePayment.invoice);
      const subscriptionId = getSubscriptionIdFromInvoice(inv);
      if (subscriptionId) {
        const subRow = await txClient.query(
          'SELECT donor_name, donor_email, user_id, stripe_customer_id, "interval" FROM donation_subscriptions WHERE stripe_subscription_id = $1',
          [subscriptionId]
        );
        if (subRow.rows.length > 0) {
          reconciled = { ...subRow.rows[0], subscriptionId };
        }
      }
    }

    let result;
    if (reconciled) {
      result = await txClient.query(
        `UPDATE donations SET status = 'completed', amount_cents = $1, currency = $2, updated_at = $3,
           donor_name = $4, donor_email = $5, user_id = $6, type = 'recurring',
           stripe_subscription_id = $7, stripe_customer_id = COALESCE(stripe_customer_id, $8)
         WHERE id = $9 RETURNING id, receipt_number`,
        [finalAmount, currency, now, reconciled.donor_name, reconciled.donor_email, reconciled.user_id, reconciled.subscriptionId, reconciled.stripe_customer_id, row.id]
      );
    } else {
      result = await txClient.query(
        `UPDATE donations SET status = 'completed', amount_cents = $1, currency = $2, updated_at = $3 WHERE id = $4 RETURNING id, receipt_number`,
        [finalAmount, currency, now, row.id]
      );
    }

    const donation = result.rows[0];
    if (!donation.receipt_number) {
      const receiptNumber = generateReceiptNumber(donation.id);
      await txClient.query('UPDATE donations SET receipt_number = $1, receipt_sent = FALSE WHERE id = $2', [receiptNumber, donation.id]);

      const effectiveEmail = reconciled?.donor_email || row.donor_email;
      const effectiveName = reconciled?.donor_name || row.donor_name;
      const effectiveSubId = reconciled?.subscriptionId || row.stripe_subscription_id;
      let frequency = reconciled?.interval || null;
      if (!frequency && effectiveSubId) {
        const subRow = await txClient.query('SELECT "interval" FROM donation_subscriptions WHERE stripe_subscription_id = $1', [effectiveSubId]);
        frequency = subRow.rows[0]?.interval || null;
      }
      if (effectiveEmail) {
        setImmediate(() => {
          sendDonationReceipt({
            to: effectiveEmail, donorName: effectiveName,
            amount: (finalAmount / 100).toFixed(2), receiptNumber,
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            note: null, isRecurring: !!effectiveSubId, frequency,
          }).then(sent => { if (sent) query('UPDATE donations SET receipt_sent = TRUE WHERE id = $1', [donation.id]); }).catch(() => {});
        });
      }
    }
  } else {
    // No existing row — subsequent recurring payment. Look up subscription info via invoice.
    let donorName = 'Anonymous', donorEmail = '', userId = null, subscriptionId = null, frequency = null, customerId = null;

    if (invoicePayment.invoice) {
      // Let errors propagate: transaction rolls back, Stripe retries the webhook.
      // Better than silently inserting an anonymous row.
      const inv = await stripe.invoices.retrieve(invoicePayment.invoice);
      subscriptionId = getSubscriptionIdFromInvoice(inv);
      if (subscriptionId) {
        const subRow = await txClient.query(
          'SELECT donor_name, donor_email, user_id, stripe_customer_id, "interval" FROM donation_subscriptions WHERE stripe_subscription_id = $1',
          [subscriptionId]
        );
        if (subRow.rows.length > 0) {
          donorName = subRow.rows[0].donor_name;
          donorEmail = subRow.rows[0].donor_email;
          userId = subRow.rows[0].user_id;
          customerId = subRow.rows[0].stripe_customer_id;
          frequency = subRow.rows[0].interval;
        } else {
          // Orphan: subscription exists in Stripe but not in our donation_subscriptions
          // (e.g., imported from Stripe dashboard). Row will be inserted as anonymous.
          console.warn(`[Donations] invoice_payment.paid: no donation_subscriptions row for ${subscriptionId} — inserting anonymous donation`);
        }
      }
    }

    const result = await txClient.query(
      `INSERT INTO donations (stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, donor_name, donor_email, user_id, amount_cents, currency, type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'recurring', 'completed', $9, $9)
       ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET status = 'completed', amount_cents = EXCLUDED.amount_cents, updated_at = EXCLUDED.updated_at
       RETURNING id, receipt_number`,
      [piId, subscriptionId, customerId, donorName, donorEmail, userId, amountCents, currency, now]
    );

    const donation = result.rows[0];
    if (!donation.receipt_number && donorEmail) {
      const receiptNumber = generateReceiptNumber(donation.id);
      await txClient.query('UPDATE donations SET receipt_number = $1, receipt_sent = FALSE WHERE id = $2', [receiptNumber, donation.id]);
      setImmediate(() => {
        sendDonationReceipt({
          to: donorEmail, donorName,
          amount: (amountCents / 100).toFixed(2), receiptNumber,
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          note: null, isRecurring: true, frequency,
        }).then(sent => { if (sent) query('UPDATE donations SET receipt_sent = TRUE WHERE id = $1', [donation.id]); }).catch(() => {});
      });
    }
  }
}

// Stripe API 2025+: invoice.payment_failed — subscription field moved to parent
async function handleInvoicePaymentFailed(txClient, invoice, now) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  await txClient.query(
    `UPDATE donation_subscriptions SET status = 'past_due', updated_at = $1 WHERE stripe_subscription_id = $2`,
    [now, subscriptionId]
  );

  // Notify donor
  const subRow = await txClient.query(
    'SELECT donor_name, donor_email, "interval" FROM donation_subscriptions WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );
  if (subRow.rows.length > 0 && subRow.rows[0].donor_email) {
    setImmediate(() => {
      sendDonationFailedNotification({
        to: subRow.rows[0].donor_email,
        donorName: subRow.rows[0].donor_name,
        frequency: subRow.rows[0].interval,
      }).catch(() => {});
    });
  }
}

// Stripe API 2025+: current_period_end moved to item level
async function handleSubscriptionUpdated(txClient, subscription, now) {
  const sets = ['status = $1', 'updated_at = $2'];
  const params = [subscription.status, now];
  let i = 3;

  // current_period_end is now at item level (Stripe API 2025+)
  const firstItem = subscription.items?.data?.[0];
  if (firstItem?.current_period_end) {
    sets.push(`current_period_end = $${i}`);
    params.push(firstItem.current_period_end * 1000); // Stripe uses seconds
    i++;
  }

  if (subscription.status === 'incomplete_expired') {
    sets.push(`canceled_at = $${i}`);
    params.push(now);
    i++;
  }

  params.push(subscription.id);
  await txClient.query(
    `UPDATE donation_subscriptions SET ${sets.join(', ')} WHERE stripe_subscription_id = $${i}`,
    params
  );
}

async function handleSubscriptionDeleted(txClient, subscription, now) {
  await txClient.query(
    `UPDATE donation_subscriptions SET status = 'canceled', canceled_at = $1, updated_at = $1 WHERE stripe_subscription_id = $2`,
    [now, subscription.id]
  );
}

async function handleChargeRefunded(txClient, charge, now) {
  if (!charge.payment_intent) return;
  await txClient.query(
    `UPDATE donations SET status = 'refunded', updated_at = $1 WHERE stripe_payment_intent_id = $2`,
    [now, charge.payment_intent]
  );
}

// ============================================================
// DELETE /api/donations/cancel-pending/:id (auth required)
// ============================================================
router.delete('/cancel-pending/:id', authenticateToken, async (req, res) => {
  const donationId = parseInt(req.params.id);
  if (!donationId || isNaN(donationId)) return res.status(400).json({ error: 'Invalid donation ID' });

  try {
    // Only allow canceling own pending donations
    const result = await query(
      `SELECT id, stripe_payment_intent_id, stripe_subscription_id FROM donations
       WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [donationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending donation not found' });
    }

    const donation = result.rows[0];
    const now = Date.now();

    // Cancel the Stripe subscription if it exists and is incomplete
    if (stripe && donation.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(donation.stripe_subscription_id);
        if (['incomplete', 'incomplete_expired'].includes(sub.status)) {
          await stripe.subscriptions.cancel(donation.stripe_subscription_id);
        }
      } catch (err) {
        console.error('[Donations] Failed to cancel Stripe subscription:', err.message);
      }

      await query(
        `UPDATE donation_subscriptions SET status = 'canceled', canceled_at = $1, updated_at = $1
         WHERE stripe_subscription_id = $2 AND status IN ('incomplete', 'incomplete_expired')`,
        [now, donation.stripe_subscription_id]
      );
    }

    // Cancel the Stripe payment intent if it exists
    if (stripe && donation.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(donation.stripe_payment_intent_id);
      } catch (err) {
        // May already be canceled or in a non-cancelable state
        if (err.code !== 'payment_intent_unexpected_state') {
          console.error('[Donations] Failed to cancel payment intent:', err.message);
        }
      }
    }

    await query(
      `UPDATE donations SET status = 'canceled', updated_at = $1 WHERE id = $2`,
      [now, donationId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Donations] cancel-pending error:', err.message);
    res.status(500).json({ error: 'Failed to cancel donation' });
  }
});

// ============================================================
// GET /api/donations/my-donations (auth required)
// ============================================================
router.get('/my-donations', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Donations by user_id or email fallback
    const donations = await query(
      `SELECT id, amount_cents, currency, type, status, receipt_number, note, created_at
       FROM donations
       WHERE user_id = $1 OR donor_email = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.user.id, req.user.email, limit, offset]
    );

    // Active subscriptions
    const subscriptions = await query(
      `SELECT id, stripe_subscription_id, amount_cents, currency, status, "interval", current_period_end, created_at
       FROM donation_subscriptions
       WHERE user_id = $1 OR donor_email = $2
       ORDER BY created_at DESC`,
      [req.user.id, req.user.email]
    );

    // Summary
    const summary = await query(
      `SELECT COUNT(*) as total_count,
              COALESCE(SUM(amount_cents), 0) as total_cents,
              COUNT(*) FILTER (WHERE type = 'recurring') as recurring_count
       FROM donations
       WHERE (user_id = $1 OR donor_email = $2) AND status = 'completed'`,
      [req.user.id, req.user.email]
    );

    res.json({
      donations: donations.rows,
      subscriptions: subscriptions.rows,
      summary: summary.rows[0],
      page,
      limit,
    });
  } catch (err) {
    console.error('[Donations] my-donations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

// ============================================================
// POST /api/donations/customer-portal (auth required)
// ============================================================
router.post('/customer-portal', authenticateToken, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Donations are not configured' });

  try {
    const sub = await query(
      'SELECT stripe_customer_id FROM donation_subscriptions WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (sub.rows.length === 0) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.rows[0].stripe_customer_id,
      return_url: `${process.env.SITE_URL || 'https://opendoorchristian.church'}/dashboard/donations`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Donations] customer-portal error:', err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ============================================================
// GET /api/donations/admin/summary (admin only)
// ============================================================
router.get('/admin/summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = Date.now();
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const [allTime, thisMonth, lastMonth, recurring, recent] = await Promise.all([
      query(`SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents FROM donations WHERE status = 'completed'`),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents FROM donations WHERE status = 'completed' AND created_at >= $1`, [thisMonthStart.getTime()]),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents FROM donations WHERE status = 'completed' AND created_at >= $1 AND created_at < $2`, [lastMonthStart.getTime(), thisMonthStart.getTime()]),
      query(`SELECT COUNT(*) as active_count, COALESCE(SUM(CASE WHEN "interval" = 'week' THEN amount_cents * 4 ELSE amount_cents END), 0) as mrr_cents FROM donation_subscriptions WHERE status = 'active'`),
      query(`SELECT d.id, d.donor_name, d.donor_email, d.amount_cents, d.type, d.status, d.created_at FROM donations d ORDER BY d.created_at DESC LIMIT 20`),
    ]);

    res.json({
      allTime: allTime.rows[0],
      thisMonth: thisMonth.rows[0],
      lastMonth: lastMonth.rows[0],
      recurring: recurring.rows[0],
      recent: recent.rows,
    });
  } catch (err) {
    console.error('[Donations] admin/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch donation summary' });
  }
});

// ============================================================
// GET /api/donations/admin/list (admin only)
// ============================================================
router.get('/admin/list', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let i = 1;

    if (req.query.type && ['one_time', 'recurring'].includes(req.query.type)) {
      where += ` AND d.type = $${i++}`;
      params.push(req.query.type);
    }
    if (req.query.status && ['pending', 'completed', 'failed', 'refunded', 'canceled'].includes(req.query.status)) {
      where += ` AND d.status = $${i++}`;
      params.push(req.query.status);
    }
    if (req.query.from) {
      where += ` AND d.created_at >= $${i++}`;
      params.push(parseInt(req.query.from));
    }
    if (req.query.to) {
      where += ` AND d.created_at <= $${i++}`;
      params.push(parseInt(req.query.to));
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM donations d ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(limit, offset);
    const donations = await query(
      `SELECT d.id, d.donor_name, d.donor_email, d.amount_cents, d.currency, d.type, d.status, d.receipt_number, d.note, d.created_at
       FROM donations d ${where}
       ORDER BY d.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );

    res.json({
      donations: donations.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Donations] admin/list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

export default router;
