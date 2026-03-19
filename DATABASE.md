# Database Schema Documentation

## Overview

The application uses PostgreSQL as its primary database. The schema is self-initializing via `server/db.js` with automatic table and index creation on startup.

**Connection:** `DATABASE_URL` environment variable  
**Initialization:** Automatic on server start  
**Migrations:** Schema alterations handled in `db.js` init function

## Core Tables

### users

User accounts and authentication.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'subscriber'
    CHECK (role IN ('subscriber','contributor','admin')),
  profile_image VARCHAR(500),
  newsletter_opted_out BOOLEAN DEFAULT FALSE,
  directory_listed BOOLEAN DEFAULT TRUE,
  directory_phone BOOLEAN DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Fields:**
- `email`: Unique email address (login credential)
- `password_hash`: bcryptjs-hashed password (null for OAuth/external auth)
- `name`: Display name
- `phone`: Optional contact phone
- `role`: User privilege level (subscriber < contributor < admin)
- `profile_image`: Path to profile picture
- `newsletter_opted_out`: Email subscription preference
- `directory_listed`: Show in member directory
- `directory_phone`: Show phone in directory
- `created_at`, `updated_at`: UNIX timestamps in milliseconds

**Indexes:**
- Primary key on `id`
- Unique constraint on `email`

**Roles:**
- **Subscriber**: Read-only, can comment on posts
- **Contributor**: Can create and edit own blog posts
- **Admin**: Full dashboard access, manage users/content

---

### posts

Blog articles and content.

```sql
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  content_plain_backup TEXT,
  content_format TEXT DEFAULT 'text',
  excerpt VARCHAR(1000),
  featured_image VARCHAR(500),
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  published_at BIGINT,
  recurrence VARCHAR(20),
  day_of_week INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Fields:**
- `title`: Blog post title
- `slug`: URL-friendly identifier (e.g., "hello-world")
- `content`: Full HTML/rich text content
- `content_plain_backup`: Plain text version for search
- `content_format`: Format type ('text', 'html', 'rich')
- `excerpt`: Short preview text
- `featured_image`: Hero image path
- `author_id`: Foreign key to users.id
- `status`: 'draft' (unpublished) or 'published'
- `published_at`: Timestamp when published (null if draft)
- `recurrence`: 'none', 'weekly', 'monthly' (for recurring posts)
- `day_of_week`: 0-6 (Monday-Sunday) for weekly recurrence
- `created_at`, `updated_at`: UNIX timestamps

**Indexes:**
- `idx_posts_author`: Foreign key lookup
- `idx_posts_status`: Filter by published/draft
- `idx_posts_slug`: URL slug lookup

**Notes:**
- Only published posts appear on public blog
- Contributors can only edit their own posts
- Admins can edit any post

---

### comments

Blog post comments.

```sql
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_name VARCHAR(255) NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  approved BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
```

**Fields:**
- `post_id`: Foreign key to posts.id
- `author_name`: Commenter name
- `author_email`: Commenter email
- `content`: Comment text
- `approved`: Publication status (admin approval required)
- `created_at`: UNIX timestamp

**Indexes:**
- `idx_comments_post`: Find comments by post

**Notes:**
- Comments default to unapproved (moderation)
- Only approved comments display publicly
- User must be logged in to comment

---

### events

Church services and special events.

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(500) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  end_date DATE,
  end_time TIME,
  image VARCHAR(500),
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recurrence VARCHAR(20),
  day_of_week INTEGER,
  week_of_month INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Fields:**
- `title`: Event name (e.g., "Sunday Service")
- `description`: Event details
- `location`: Address or venue
- `event_date`: Start date (YYYY-MM-DD)
- `event_time`: Start time (HH:MM:SS)
- `end_date`: End date (multi-day events)
- `end_time`: End time
- `image`: Event cover image
- `author_id`: Creator/organizer
- `recurrence`: 'weekly', 'monthly', 'none', etc.
- `day_of_week`: 0-6 for weekly recurrence
- `week_of_month`: 1-4 for monthly recurrence
- `created_at`, `updated_at`: UNIX timestamps

**Indexes:**
- `idx_events_date`: Find events by date range
- `idx_events_author`: Find events by creator

**Notes:**
- Recurring events are generated dynamically
- Regular services defined separately (e.g., "Sunday 8:30 AM drive-in")

---

### contact_submissions

Contact form submissions and inquiries.

```sql
CREATE TABLE contact_submissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'contact',
  read BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
```

**Fields:**
- `name`: Submitter name
- `email`: Contact email
- `phone`: Optional phone number
- `message`: Inquiry/message text
- `type`: Type of submission ('contact', 'prayer', etc.)
- `read`: Admin has reviewed
- `created_at`: UNIX timestamp

**Notes:**
- Public form submissions
- Admins view in dashboard
- No authentication required

---

### password_reset_tokens

Password reset token management.

```sql
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
```

**Fields:**
- `user_id`: Foreign key to users.id
- `token`: Unique reset token
- `expires_at`: Expiration timestamp (usually 1 hour)
- `used`: Whether token has been consumed
- `created_at`: UNIX timestamp

**Indexes:**
- `idx_password_reset_tokens_token`: Look up by token
- `idx_password_reset_tokens_user`: Find tokens by user

---

## Email System Tables

A comprehensive email system with accounts, messages, contacts, and audit logging.

### email_accounts

Email accounts configured in the system.

```sql
CREATE TABLE email_accounts (
  id SERIAL PRIMARY KEY,
  address VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  forwarding_address VARCHAR(255),
  forwarding_mode VARCHAR(20) DEFAULT 'none',
  signature_html TEXT,
  auto_reply_allowed BOOLEAN DEFAULT FALSE,
  quota_mb INTEGER DEFAULT 500,
  used_mb NUMERIC(10,2) DEFAULT 0,
  is_catch_all BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  daily_send_count INTEGER DEFAULT 0,
  daily_send_limit INTEGER DEFAULT 100,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Features:**
- Multiple accounts per user
- Email forwarding rules
- HTML signature templates
- Storage quota management
- Daily send rate limiting
- Catch-all configuration
- Activation toggle

### email_aliases

Email aliases for accounts.

```sql
CREATE TABLE email_aliases (
  id SERIAL PRIMARY KEY,
  alias_address VARCHAR(255) NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
```

### email_folders

Custom email folders (inbox, sent, drafts, trash, custom).

```sql
CREATE TABLE email_folders (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'custom',
  sort_order INTEGER DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE(account_id, name)
);
```

**Folder Types:** 'inbox', 'sent', 'drafts', 'trash', 'custom'

### email_messages

Email messages (sent and received).

```sql
CREATE TABLE email_messages (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES email_folders(id) ON DELETE SET NULL,
  message_id VARCHAR(512),
  in_reply_to VARCHAR(512),
  references_header TEXT,
  thread_id VARCHAR(512),
  from_address VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_addresses JSONB NOT NULL DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  bcc_addresses JSONB DEFAULT '[]',
  subject VARCHAR(1000),
  body_text TEXT,
  body_html TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  is_draft BOOLEAN DEFAULT FALSE,
  priority VARCHAR(10) DEFAULT 'normal',
  size_bytes INTEGER DEFAULT 0,
  spam_score NUMERIC(5,2),
  direction VARCHAR(10) NOT NULL,
  send_status VARCHAR(20),
  send_error TEXT,
  scheduled_send_at BIGINT,
  sent_at BIGINT,
  received_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Key Features:**
- Message threading (thread_id)
- Conversation grouping (in_reply_to, references_header)
- Both plain text and HTML versions
- Read/unread tracking
- Starred/flagged messages
- Priority levels
- Spam scoring
- Scheduled sending
- Send status tracking

**Indexes:**
- `idx_email_messages_account_folder`: Folder listing
- `idx_email_messages_thread`: Thread grouping
- `idx_email_messages_received`: Sort by date
- `idx_email_messages_unread`: Find unread messages
- `idx_email_messages_account_message_id`: Unique message lookup
- `idx_email_messages_search`: Full-text search on subject/body

### email_attachments

Email attachments.

```sql
CREATE TABLE email_attachments (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  content_type VARCHAR(255),
  size_bytes INTEGER NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  content_id VARCHAR(255),
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
```

**Fields:**
- `storage_path`: Path in local filesystem or S3
- `content_id`: For inline images (CID references)
- `is_blocked`: Dangerous file blocking

### email_contacts

Contacts for quick reply/selection.

```sql
CREATE TABLE email_contacts (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(account_id, email)
);
```

### email_auto_replies

Out-of-office auto-reply configuration.

```sql
CREATE TABLE email_auto_replies (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT FALSE,
  subject VARCHAR(500) DEFAULT 'Out of Office',
  body_html TEXT NOT NULL,
  start_date BIGINT,
  end_date BIGINT,
  reply_once_per_sender BOOLEAN DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(account_id)
);
```

**Features:**
- Date range for seasonal replies
- Reply-once-per-sender to avoid spam

### email_auto_reply_log

Tracking of who has received auto-replies.

```sql
CREATE TABLE email_auto_reply_log (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  sender_address VARCHAR(255) NOT NULL,
  replied_at BIGINT NOT NULL,
  UNIQUE(account_id, sender_address)
);
```

### email_audit_log

Audit trail of all email actions.

```sql
CREATE TABLE email_audit_log (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  message_id INTEGER REFERENCES email_messages(id),
  details JSONB,
  ip_address VARCHAR(45),
  created_at BIGINT NOT NULL
);
```

**Actions:** 'send', 'receive', 'read', 'delete', 'move', 'flag', etc.

**Indexes:**
- `idx_email_audit_account`: Find actions by account

### email_system_logs

System-level email debugging logs.

```sql
CREATE TABLE email_system_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at BIGINT NOT NULL
);
```

**Levels:** 'error', 'warn', 'info', 'debug'

---

## Donation Tables

### donations

Donation records with Stripe integration.

```sql
CREATE TABLE donations (
  id SERIAL PRIMARY KEY,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  donor_name VARCHAR(255) NOT NULL,
  donor_email VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  type VARCHAR(20) NOT NULL CHECK (type IN ('one_time', 'recurring')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'canceled')),
  receipt_sent BOOLEAN DEFAULT FALSE,
  receipt_number VARCHAR(50) UNIQUE,
  note VARCHAR(500),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Fields:**
- `amount_cents`: Donation amount in cents (e.g., 10000 = $100.00)
- `type`: 'one_time' or 'recurring' (subscription)
- `status`: Payment status
- `receipt_number`: Sequential receipt ID for accounting
- `note`: Internal notes or donor message

**Indexes:**
- `idx_donations_email`: Find donations by email
- `idx_donations_user`: Find donations by user
- `idx_donations_status`: Filter by status
- `idx_donations_created`: Sort by date
- `idx_donations_subscription`: Link to subscription

### donation_subscriptions

Recurring donation subscriptions via Stripe.

```sql
CREATE TABLE donation_subscriptions (
  id SERIAL PRIMARY KEY,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  donor_name VARCHAR(255) NOT NULL,
  donor_email VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(20) NOT NULL DEFAULT 'incomplete',
  current_period_end BIGINT,
  canceled_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

**Statuses:**
- `incomplete`: Not yet confirmed
- `active`: Currently charging
- `past_due`: Payment failed
- `canceled`: Manually canceled
- `paused`: Temporarily paused

### stripe_webhook_events

Idempotency tracking for Stripe webhooks.

```sql
CREATE TABLE stripe_webhook_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at BIGINT NOT NULL
);
```

**Purpose:** Prevent duplicate processing of webhook events

---

## Newsletter Tables

### newsletters

Email newsletter campaigns.

```sql
CREATE TABLE newsletters (
  id SERIAL PRIMARY KEY,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  sent_at BIGINT,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

### newsletter_sends

Tracking individual newsletter deliveries.

```sql
CREATE TABLE newsletter_sends (
  id SERIAL PRIMARY KEY,
  newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  error TEXT,
  sent_at BIGINT,
  UNIQUE(newsletter_id, user_id)
);
```

**Indexes:**
- `idx_newsletter_sends_status`: Find pending sends

---

## Timestamp Format

All timestamps in the database use **UNIX milliseconds** (JavaScript `Date.now()` format).

```javascript
// To convert in JavaScript:
const timestamp = 1703001234567;  // milliseconds since 1970-01-01
const date = new Date(timestamp);

// To insert in JavaScript:
const now = Date.now();
await pool.query('INSERT INTO users (..., created_at) VALUES (..., $1)', [now]);
```

---

## Querying Examples

### Get user with posts
```sql
SELECT u.id, u.name, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.author_id AND p.status = 'published'
WHERE u.id = 1
GROUP BY u.id;
```

### Get latest blog posts with comments
```sql
SELECT p.*, u.name as author_name, COUNT(c.id) as comment_count
FROM posts p
JOIN users u ON p.author_id = u.id
LEFT JOIN comments c ON p.id = c.post_id
WHERE p.status = 'published'
GROUP BY p.id, u.id
ORDER BY p.published_at DESC
LIMIT 10;
```

### Get email inbox with unread count
```sql
SELECT em.*, COUNT(CASE WHEN em.is_read = FALSE THEN 1 END) as unread
FROM email_messages em
JOIN email_folders ef ON em.folder_id = ef.id
WHERE em.account_id = 1 AND ef.name = 'inbox'
GROUP BY em.id
ORDER BY em.received_at DESC;
```

### Get total donations by month
```sql
SELECT 
  DATE_TRUNC('month', TO_TIMESTAMP(d.created_at / 1000)) as month,
  COUNT(*) as count,
  SUM(d.amount_cents) / 100.0 as total
FROM donations d
WHERE d.status = 'completed'
GROUP BY DATE_TRUNC('month', TO_TIMESTAMP(d.created_at / 1000))
ORDER BY month DESC;
```
