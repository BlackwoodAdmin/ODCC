import sgMail from '@sendgrid/mail';
import crypto from 'crypto';
import { wrapEmailHtml, wrapEmailText } from './data/email-template-wrapper.js';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@opendoorchristian.church';
const FROM_NAME = 'Open Door Christian Church';
const SITE_URL = process.env.SITE_URL || 'https://opendoorchristian.church';
const UNSUBSCRIBE_SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;

let initialized = false;

function ensureInit() {
  if (initialized) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (apiKey) {
    sgMail.setApiKey(apiKey);
    initialized = true;
  }
}

export async function sendEmail({ to, subject, html }) {
  ensureInit();
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[Email] SENDGRID_API_KEY not configured, skipping');
    return false;
  }
  try {
    await sgMail.send({ to, from: { email: FROM_EMAIL, name: FROM_NAME }, subject, html });
    console.log('[Email] Sent:', { to, subject });
    return true;
  } catch (err) {
    console.error('[Email] Failed:', err?.response?.body || err.message);
    return false;
  }
}

export function generateUnsubscribeUrl(email) {
  const token = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update('newsletter-unsubscribe:' + email.toLowerCase())
    .digest('hex');
  return `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email.toLowerCase())}&token=${token}`;
}

export async function sendNewsletter(personalizations, subject, bodyHtml, bodyText) {
  ensureInit();
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[Email] SENDGRID_API_KEY not configured, skipping newsletter');
    return false;
  }
  const wrappedHtml = wrapEmailHtml(bodyHtml);
  const wrappedText = wrapEmailText(bodyText);
  try {
    await sgMail.send({
      personalizations,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html: wrappedHtml,
      text: wrappedText,
    });
    console.log(`[Email] Newsletter sent to ${personalizations.length} recipients`);
    return true;
  } catch (err) {
    console.error('[Email] Newsletter send failed:', err?.response?.body || err.message);
    return false;
  }
}

export async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Password Reset</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          We received a request to reset your password. Click the button below to choose a new one.
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${resetUrl}" style="display:inline-block;background:#7C9A72;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
            Reset Password
          </a>
        </div>
        <p style="color:#9ca3af;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      </div>
      <div style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">1700 S Clara Ave, DeLand, FL 32720</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: 'Reset your password — Open Door Christian Church', html });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendDonationReceipt({ to, donorName, amount, receiptNumber, date, note, isRecurring }) {
  const safeName = escapeHtml(donorName);
  const safeNote = note ? escapeHtml(note) : null;
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Donation Receipt</p>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Thank you, ${safeName}!</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Your generous ${isRecurring ? 'monthly ' : ''}donation has been received. God bless you for your faithfulness.
        </p>
        <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-weight:600;font-size:16px;">$${amount}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Receipt #</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${receiptNumber}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Type</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${isRecurring ? 'Monthly Recurring' : 'One-Time'}</td></tr>
            ${safeNote ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Note</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${safeNote}</td></tr>` : ''}
          </table>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">
            <strong>Tax Deduction Notice:</strong> Open Door Christian Church is a 501(c)(3) tax-exempt organization.
            No goods or services were provided in exchange for this contribution. This receipt may be used for tax deduction purposes.
          </p>
        </div>
      </div>
      <div style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;">Open Door Christian Church</p>
        <p style="margin:0;color:#9ca3af;font-size:12px;">1700 S Clara Ave, DeLand, FL 32720</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: `Donation Receipt ${receiptNumber} — Open Door Christian Church`, html });
}

export async function sendDonationFailedNotification({ to, donorName }) {
  const safeName = escapeHtml(donorName);
  const portalUrl = `${SITE_URL}/dashboard/donations`;
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Payment Update Needed</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Hi ${safeName}, we were unable to process your monthly donation. This may be due to an expired or declined card.
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Please update your payment method to continue your monthly giving.
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${portalUrl}" style="display:inline-block;background:#7C9A72;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
            Manage Subscription
          </a>
        </div>
      </div>
      <div style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">1700 S Clara Ave, DeLand, FL 32720</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: 'Action Needed: Monthly Donation Payment Failed', html });
}

export async function sendWelcomeEmail(to, name) {
  const loginUrl = `${SITE_URL}/login`;
  const safeName = escapeHtml(name) || 'friend';
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Welcome, ${safeName}!</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Thank you for subscribing to our newsletter. You'll receive updates about events, blog posts, and what's happening at Open Door Christian Church.
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Want to join the conversation? You can set up a password to comment on blog posts.
        </p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#7C9A72;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
            Visit Our Website
          </a>
        </div>
      </div>
      <div style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;">1700 S Clara Ave, DeLand, FL 32720</p>
        <p style="margin:0;color:#9ca3af;font-size:12px;">
          <a href="${generateUnsubscribeUrl(to)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from our newsletter
        </p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: 'Welcome to Open Door Christian Church!', html });
}
