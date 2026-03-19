import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { emailLog } from '../utils/email-log.js';

const router = Router();

/**
 * Verify SendGrid's ECDSA signature on the webhook payload.
 * Uses the public key from SENDGRID_WEBHOOK_VERIFICATION_KEY env var.
 */
function verifySignature(publicKey, payload, signature, timestamp) {
  try {
    const timestampPayload = timestamp + payload;
    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload);
    verifier.end();
    return verifier.verify(publicKey, signature, 'base64');
  } catch (err) {
    console.error('[EmailEvents] Signature verification error:', err.message);
    return false;
  }
}

/**
 * POST /events/:token
 *
 * SendGrid Event Webhook handler. Validates URL token and ECDSA signature,
 * then processes bounce/drop/deferred/delivered events.
 */
router.post('/events/:token', async (req, res) => {
  try {
    // Validate URL token (timing-safe comparison)
    const expectedToken = process.env.EVENT_WEBHOOK_SECRET;
    if (!expectedToken) {
      return res.status(403).json({ error: 'Invalid webhook token' });
    }
    try {
      const tokenBuf = Buffer.from(req.params.token);
      const expectedBuf = Buffer.from(expectedToken);
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return res.status(403).json({ error: 'Invalid webhook token' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid webhook token' });
    }

    // Verify SendGrid ECDSA signature
    const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    if (verificationKey) {
      const signature = req.headers['x-twilio-email-event-webhook-signature'];
      const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

      if (!signature || !timestamp) {
        await emailLog('warn', 'bounce', 'Missing SendGrid signature headers');
        return res.status(403).json({ error: 'Missing signature headers' });
      }

      // req.body is parsed JSON, but signature is computed on the raw body string
      const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body);
      if (!verifySignature(verificationKey, rawBody, signature, timestamp)) {
        await emailLog('warn', 'bounce', 'Invalid SendGrid webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    const events = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Expected array of events' });
    }

    for (const event of events) {
      try {
        const eventType = event.event;
        const reason = event.reason || event.response || 'Unknown';
        const sgMessageId = event.sg_message_id || null;
        const dbId = event['X-Message-DB-Id'] || null;

        await emailLog('info', 'bounce', `SendGrid event: ${eventType}`, {
          event: eventType,
          email: event.email,
          reason,
          sg_message_id: sgMessageId,
          db_id: dbId,
        });

        if (eventType === 'bounce' || eventType === 'dropped') {
          const sendError = eventType === 'bounce'
            ? `Address does not exist: ${reason}`
            : `Dropped: ${reason}`;

          // Try matching by X-Message-DB-Id first, fall back to sg_message_id
          let updated = false;

          if (dbId) {
            const result = await query(
              `UPDATE email_messages SET send_status = 'failed', send_error = $1, updated_at = $2 WHERE id = $3 AND send_status != 'failed'`,
              [sendError, Date.now(), dbId]
            );
            updated = result.rowCount > 0;
          }

          if (!updated && sgMessageId) {
            // sg_message_id from SendGrid may include a filter suffix after a period
            const baseId = sgMessageId.split('.')[0];
            const result = await query(
              `UPDATE email_messages SET send_status = 'failed', send_error = $1, updated_at = $2 WHERE message_id LIKE $3 AND send_status != 'failed'`,
              [sendError, Date.now(), `${baseId}%`]
            );
            updated = result.rowCount > 0;
          }

          if (!updated) {
            await emailLog('warn', 'bounce', `Could not match ${eventType} event to a message`, {
              sg_message_id: sgMessageId,
              db_id: dbId,
              email: event.email,
            });
          }
        } else if (eventType === 'deferred') {
          await emailLog('warn', 'bounce', `Delivery deferred for ${event.email}: ${reason}`, {
            sg_message_id: sgMessageId,
            attempt: event.attempt,
          });
        }
        // 'delivered' — no action needed, already marked sent
      } catch (eventErr) {
        console.error('[EmailEvents] Failed to process individual event:', eventErr.message);
        await emailLog('error', 'bounce', `Failed to process event: ${eventErr.message}`, {
          event_type: event.event, email: event.email,
        }).catch(() => {});
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[EmailEvents] Webhook error:', err);
    await emailLog('error', 'bounce', `Webhook processing error: ${err.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
