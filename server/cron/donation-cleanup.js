import { query } from '../db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanupAbandonedDonations() {
  try {
    const cutoff = Date.now() - DAY_MS;
    const result = await query(
      `UPDATE donations SET status = 'canceled', updated_at = $1 WHERE status = 'pending' AND created_at < $2`,
      [Date.now(), cutoff]
    );
    if (result.rowCount > 0) {
      console.log(`[Donation Cron] Canceled ${result.rowCount} abandoned pending donations`);
    }
  } catch (err) {
    console.error('[Donation Cron] Abandoned cleanup error:', err.message);
  }
}

async function cleanupWebhookEvents() {
  try {
    const cutoff = Date.now() - (90 * DAY_MS);
    const result = await query(
      `DELETE FROM stripe_webhook_events WHERE processed_at < $1`,
      [cutoff]
    );
    if (result.rowCount > 0) {
      console.log(`[Donation Cron] Purged ${result.rowCount} old webhook events`);
    }
  } catch (err) {
    console.error('[Donation Cron] Webhook cleanup error:', err.message);
  }
}

export function initDonationCrons() {
  // Run once on startup
  cleanupAbandonedDonations();
  cleanupWebhookEvents();

  // Then daily
  setInterval(() => {
    cleanupAbandonedDonations();
    cleanupWebhookEvents();
  }, DAY_MS);

  console.log('[Donation Cron] Initialized');
}
