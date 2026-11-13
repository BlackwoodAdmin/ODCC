import sgMail from '@sendgrid/mail';
import crypto from 'crypto';
import { wrapEmailHtml, wrapEmailText } from './data/email-template-wrapper.js';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'hello@opendoorchristian.church';
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
    const response = await sgMail.send({ to, from: { email: FROM_EMAIL, name: FROM_NAME }, subject, html });
    console.log('[Email] Sent to:', to, 'Subject:', subject, 'Response:', response[0].statusCode);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send to', to, '— Error:', err?.response?.body?.errors || err.message);
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
    const recipients = personalizations.map(p => p.to.map(t => t.email).join(',')).join(';');
    console.log('[Email] Newsletter sending to:', recipients, 'Subject:', subject);
    const response = await sgMail.send({
      personalizations,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html: wrappedHtml,
      text: wrappedText,
    });
    console.log(`[Email] Newsletter sent to ${personalizations.length} recipients. From: ${FROM_EMAIL}. Response: ${response[0].statusCode}`);
    return true;
  } catch (err) {
    console.error('[Email] Newsletter send failed from', FROM_EMAIL, '— Error:', err?.response?.body?.errors || err.message);
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

export async function sendDonationReceipt({ to, donorName, amount, receiptNumber, date, note, isRecurring, frequency }) {
  const safeName = escapeHtml(donorName);
  const safeNote = note ? escapeHtml(note) : null;
  const freqLabel = frequency === 'week' ? 'weekly' : frequency === 'month' ? 'monthly' : (isRecurring ? 'recurring' : '');
  const typeLabel = frequency === 'week' ? 'Weekly Recurring' : frequency === 'month' ? 'Monthly Recurring' : (isRecurring ? 'Recurring' : 'One-Time');
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Donation Receipt</p>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Thank you, ${safeName}!</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Your generous ${freqLabel ? freqLabel + ' ' : ''}donation has been received. God bless you for your faithfulness.
        </p>
        <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-weight:600;font-size:16px;">$${amount}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Receipt #</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${receiptNumber}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Type</td><td style="padding:6px 0;text-align:right;color:#1f2937;font-size:14px;">${typeLabel}</td></tr>
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

export async function sendDonationFailedNotification({ to, donorName, frequency }) {
  const safeName = escapeHtml(donorName);
  const freqLabel = frequency === 'week' ? 'weekly' : 'monthly';
  const portalUrl = `${SITE_URL}/dashboard/donations`;
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Payment Update Needed</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Hi ${safeName}, we were unable to process your ${freqLabel} donation. This may be due to an expired or declined card.
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Please update your payment method to continue your ${freqLabel} giving.
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
  return sendEmail({ to, subject: `Action Needed: ${freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1)} Donation Payment Failed`, html });
}

export async function sendVisitWelcomeEmail({ to, name, visitDate }) {
  const safeName = escapeHtml(name) || 'friend';
  // visitDate is a calendar date string (YYYY-MM-DD) — parse as local date,
  // never through the Date string parser, so the day doesn't shift.
  let visitLine = '';
  if (visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    const [y, m, d] = visitDate.split('-').map(Number);
    const pretty = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    visitLine = `<p style="color:#4b5563;font-size:15px;line-height:1.6;">We'll be looking for you on <strong>${escapeHtml(pretty)}</strong> — and if plans change, no worries at all. Our doors are open every week.</p>`;
  }
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=Open+Door+Christian+Church+1700+S+Clara+Ave+DeLand+FL+32720';
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:#7C9A72;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;">Open Door Christian Church</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">We can't wait to meet you</p>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Welcome, ${safeName}!</h2>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Thank you for planning a visit to Open Door. There's no dress code, no pressure, and nothing you need to do
          to prepare — just come as you are. Here's everything you need for your first Sunday.
        </p>
        ${visitLine}
        <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:20px 0;">
          <p style="margin:0 0 10px;color:#1f2937;font-weight:600;font-size:15px;">Sunday Mornings</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#1f2937;font-weight:600;font-size:14px;white-space:nowrap;">8:30 AM</td><td style="padding:5px 0 5px 14px;color:#6b7280;font-size:14px;">Fellowship time in the sanctuary — coffee and breakfast foods</td></tr>
            <tr><td style="padding:5px 0;color:#1f2937;font-weight:600;font-size:14px;white-space:nowrap;">9:00 AM</td><td style="padding:5px 0 5px 14px;color:#6b7280;font-size:14px;">Drive-in service in the garden — tune your radio to FM 87.9</td></tr>
            <tr><td style="padding:5px 0;color:#1f2937;font-weight:600;font-size:14px;white-space:nowrap;">10:15 AM</td><td style="padding:5px 0 5px 14px;color:#6b7280;font-size:14px;">Bible study in the sanctuary</td></tr>
            <tr><td style="padding:5px 0;color:#1f2937;font-weight:600;font-size:14px;white-space:nowrap;">11:00 AM</td><td style="padding:5px 0 5px 14px;color:#6b7280;font-size:14px;">Indoor service in the sanctuary — hymns, communion, prayer, and the message</td></tr>
          </table>
          <p style="margin:10px 0 0;color:#9ca3af;font-size:13px;">The 9:00 drive-in and 11:00 indoor service share the same sermon — come to whichever fits you best, or make a morning of it. Communion is served every Sunday.</p>
        </div>
        <div style="background:#f0f7ee;border:1px solid #cfe0c8;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;color:#3f5c38;font-size:13px;line-height:1.6;">
            <strong>First time at a drive-in service?</strong> Pull into the garden, tune your car radio to
            <strong>87.9 FM</strong>, and worship right from your seat. Roll the windows down, bring your coffee —
            pajamas welcome. Outdoor speakers are set up if you prefer a chair under the sky, and the kitchen is
            open before and after with hot breakfast items, donuts, coffee and juice.
          </p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${mapsUrl}" style="display:inline-block;background:#7C9A72;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
            Get Directions
          </a>
          <p style="margin:10px 0 0;color:#9ca3af;font-size:13px;">1700 S Clara Ave, DeLand, FL 32720</p>
        </div>
        <div style="border-left:3px solid #7C9A72;padding:4px 0 4px 16px;margin:24px 0;">
          <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;font-style:italic;">
            "We're so glad you're coming. At Open Door you'll find a church family with no book but the Bible and
            no creed but Christ — and a seat saved just for you. I look forward to meeting you personally."
          </p>
          <p style="margin:8px 0 0;color:#1f2937;font-size:14px;font-weight:600;">— Pastor Stephen Presley</p>
        </div>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;">
          Questions before Sunday? Just reply to this email or call us at <a href="tel:3867348200" style="color:#7C9A72;">(386) 734-8200</a> —
          the office is open Tuesday through Friday, 9:00 AM to 2:00 PM.
        </p>
      </div>
      <div style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;">Open Door Christian Church</p>
        <p style="margin:0;color:#9ca3af;font-size:12px;">1700 S Clara Ave, DeLand, FL 32720 · (386) 734-8200</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: "We can't wait to meet you — Open Door Christian Church", html });
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
