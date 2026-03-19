# API Reference

Comprehensive documentation of all REST API endpoints.

## Base URL

```
https://opendoorchristian.church/api
```

## Authentication

Most endpoints require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**Token Format:** JWT containing `userId`, `email`, and `role`

## Response Format

All responses use JSON:

**Success (2xx):**
```json
{
  "id": 123,
  "name": "Example",
  "created_at": 1703001234567
}
```

**Error (4xx, 5xx):**
```json
{
  "error": "User not found",
  "status": 404
}
```

## Endpoints by Category

### Authentication

#### POST `/auth/register`

Register a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "subscriber",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

#### POST `/auth/login`

Authenticate user and get JWT token.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "subscriber",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors:**
- `401`: Invalid credentials
- `404`: User not found

---

#### POST `/auth/forgot-password`

Request password reset email.

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Reset link sent to email"
}
```

**Notes:**
- Email contains reset token link
- Token expires in 1 hour

---

#### POST `/auth/reset-password`

Reset password with valid token.

**Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "newPassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successful"
}
```

---

### Blog Posts

#### GET `/posts`

List all published blog posts.

**Query Parameters:**
- `limit` (number): Results per page (default: 10)
- `offset` (number): Skip results (default: 0)
- `author` (number): Filter by author ID

**Response (200):**
```json
[
  {
    "id": 1,
    "title": "Welcome to Our Blog",
    "slug": "welcome-to-our-blog",
    "excerpt": "First blog post...",
    "featured_image": "/uploads/post_123.jpg",
    "author_id": 2,
    "author_name": "Jane Doe",
    "status": "published",
    "published_at": 1703001234567,
    "created_at": 1703001234567,
    "updated_at": 1703001234567,
    "comment_count": 3
  }
]
```

---

#### GET `/posts/:id`

Get a single blog post by ID or slug.

**Response (200):**
```json
{
  "id": 1,
  "title": "Welcome to Our Blog",
  "slug": "welcome-to-our-blog",
  "content": "<h1>Welcome</h1><p>...</p>",
  "excerpt": "First blog post...",
  "featured_image": "/uploads/post_123.jpg",
  "author_id": 2,
  "author_name": "Jane Doe",
  "author_email": "jane@example.com",
  "status": "published",
  "published_at": 1703001234567,
  "created_at": 1703001234567,
  "updated_at": 1703001234567,
  "comments": [
    {
      "id": 1,
      "author_name": "John",
      "author_email": "john@example.com",
      "content": "Great post!",
      "approved": true,
      "created_at": 1703001234567
    }
  ]
}
```

---

#### POST `/posts` **Auth Required**

Create a new blog post (Contributor+).

**Body:**
```json
{
  "title": "New Blog Post",
  "slug": "new-blog-post",
  "content": "<h1>Title</h1><p>Content...</p>",
  "excerpt": "Short preview...",
  "featured_image": "/uploads/post_456.jpg",
  "status": "draft"
}
```

**Response (201):**
Returns created post object with `id`.

---

#### PUT `/posts/:id` **Auth Required**

Update blog post (Owner or Admin).

**Body:**
Same fields as POST, any subset

**Response (200):**
Returns updated post object.

---

#### DELETE `/posts/:id` **Auth Required**

Delete blog post (Owner or Admin).

**Response (200):**
```json
{
  "message": "Post deleted"
}
```

---

### Comments

#### POST `/comments`

Submit a new comment on a blog post.

**Body:**
```json
{
  "post_id": 1,
  "author_name": "John Doe",
  "author_email": "john@example.com",
  "content": "Great post, thank you for sharing!"
}
```

**Response (201):**
```json
{
  "id": 1,
  "post_id": 1,
  "author_name": "John Doe",
  "author_email": "john@example.com",
  "content": "Great post, thank you for sharing!",
  "approved": false,
  "created_at": 1703001234567
}
```

**Notes:**
- Comments require Turnstile verification
- Comments default to unapproved (moderation)

---

#### DELETE `/comments/:id` **Auth Required**

Delete a comment (Admin or post author).

**Response (200):**
```json
{
  "message": "Comment deleted"
}
```

---

### Events

#### GET `/events`

List all events.

**Query Parameters:**
- `limit` (number): Results per page (default: 10)
- `offset` (number): Skip results (default: 0)
- `start_date` (string): YYYY-MM-DD
- `end_date` (string): YYYY-MM-DD

**Response (200):**
```json
[
  {
    "id": 1,
    "title": "Sunday Service",
    "description": "Join us for worship and prayer...",
    "location": "1700 S Clara Ave, DeLand, FL 32724",
    "event_date": "2024-01-14",
    "event_time": "09:30:00",
    "recurrence": "weekly",
    "day_of_week": 0,
    "image": "/uploads/event_123.jpg",
    "author_id": 2,
    "created_at": 1703001234567
  }
]
```

---

#### GET `/events/:id`

Get a single event.

**Response (200):**
Single event object with full details.

---

#### POST `/events` **Auth Required**

Create a new event (Contributor+).

**Body:**
```json
{
  "title": "Summer Picnic",
  "description": "Family picnic and games...",
  "location": "Memorial Park",
  "event_date": "2024-06-15",
  "event_time": "14:00:00",
  "recurrence": "none"
}
```

**Response (201):**
Returns created event object.

---

#### PUT `/events/:id` **Auth Required**

Update event (Owner or Admin).

**Response (200):**
Returns updated event object.

---

#### DELETE `/events/:id` **Auth Required**

Delete event (Owner or Admin).

**Response (200):**
```json
{
  "message": "Event deleted"
}
```

---

### Donations

#### POST `/donations/create-payment-intent`

Create Stripe PaymentIntent for donation.

**Body:**
```json
{
  "amount_cents": 10000,
  "donor_name": "John Doe",
  "donor_email": "john@example.com",
  "type": "one_time",
  "note": "Optional donation message"
}
```

**Response (200):**
```json
{
  "client_secret": "pi_1234_secret_567890",
  "amount": 10000,
  "currency": "usd"
}
```

**Notes:**
- Requires Turnstile verification
- Client secret used to confirm payment on frontend

---

#### GET `/donations/:user_id` **Auth Required**

Get donation history for user.

**Response (200):**
```json
[
  {
    "id": 1,
    "stripe_payment_intent_id": "pi_1234_secret_567890",
    "amount_cents": 10000,
    "currency": "usd",
    "type": "one_time",
    "status": "completed",
    "receipt_number": "REC-001",
    "created_at": 1703001234567
  }
]
```

---

#### POST `/donations/webhook`

Stripe webhook for payment confirmations (no auth required).

**Notes:**
- Stripe sends POST with signature header
- Server verifies signature with STRIPE_WEBHOOK_SECRET
- Updates donation status and sends receipt email

---

### Newsletter

#### POST `/newsletter/subscribe`

Subscribe to newsletter.

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Subscribed successfully"
}
```

---

#### POST `/newsletter/unsubscribe/:token`

Unsubscribe from newsletter (public endpoint).

**Response (200):**
```json
{
  "message": "Unsubscribed"
}
```

---

#### GET `/newsletter` **Auth Required (Admin)**

List all newsletters.

**Response (200):**
```json
[
  {
    "id": 1,
    "subject": "Monthly Newsletter",
    "body_html": "<html>...",
    "status": "sent",
    "sent_count": 150,
    "failed_count": 2,
    "sent_at": 1703001234567,
    "created_at": 1703001234567
  }
]
```

---

#### POST `/newsletter` **Auth Required (Admin)**

Create and send newsletter.

**Body:**
```json
{
  "subject": "Monthly Newsletter - January",
  "body_html": "<h1>Welcome</h1><p>...</p>",
  "send_now": true
}
```

**Response (201):**
Returns created newsletter object with sending status.

---

### Email System

#### POST `/email/accounts` **Auth Required**

Create email account.

**Body:**
```json
{
  "address": "contact@opendoorchristian.church",
  "display_name": "Open Door Contact",
  "signature_html": "<p>Blessings,<br/>Open Door Church</p>",
  "quota_mb": 1000
}
```

**Response (201):**
Returns email account object.

---

#### GET `/email/accounts` **Auth Required**

List user's email accounts.

**Response (200):**
```json
[
  {
    "id": 1,
    "address": "contact@opendoorchristian.church",
    "display_name": "Open Door Contact",
    "quota_mb": 1000,
    "used_mb": 234.5,
    "is_active": true,
    "daily_send_count": 45,
    "daily_send_limit": 100
  }
]
```

---

#### GET `/email/messages` **Auth Required**

List messages in folder.

**Query Parameters:**
- `account_id` (number): Email account
- `folder_id` (number): Folder ID
- `limit` (number): Results per page (default: 20)
- `offset` (number): Skip results

**Response (200):**
```json
[
  {
    "id": 1,
    "account_id": 1,
    "from_address": "sender@example.com",
    "from_name": "John Doe",
    "to_addresses": ["contact@opendoorchristian.church"],
    "subject": "Question about services",
    "body_text": "Hi, I have a question...",
    "is_read": false,
    "is_starred": false,
    "received_at": 1703001234567
  }
]
```

---

#### POST `/email/messages` **Auth Required**

Compose and send email message.

**Body:**
```json
{
  "account_id": 1,
  "to_addresses": ["recipient@example.com"],
  "cc_addresses": [],
  "bcc_addresses": [],
  "subject": "Response to your inquiry",
  "body_html": "<p>Thank you for reaching out...</p>",
  "scheduled_send_at": null
}
```

**Response (201):**
Returns message object with sending status.

---

#### GET `/email/messages/:id` **Auth Required**

Get full message details.

**Response (200):**
Full message object with body_html, attachments, etc.

---

#### DELETE `/email/messages/:id` **Auth Required**

Delete message (move to trash).

**Response (200):**
```json
{
  "message": "Message deleted"
}
```

---

#### PUT `/email/auto-reply/:account_id` **Auth Required**

Set up out-of-office auto-reply.

**Body:**
```json
{
  "is_enabled": true,
  "subject": "Out of Office",
  "body_html": "<p>I'm away until Monday...</p>",
  "start_date": 1703001234567,
  "end_date": 1703087634567
}
```

**Response (200):**
Returns updated auto-reply configuration.

---

### User Management

#### GET `/users/:id` **Auth Required**

Get user profile.

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "(386) 555-1234",
  "role": "contributor",
  "profile_image": "/uploads/profile_123.jpg",
  "newsletter_opted_out": false,
  "directory_listed": true,
  "directory_phone": true,
  "created_at": 1703001234567
}
```

---

#### PUT `/users/:id` **Auth Required**

Update user profile.

**Body:**
```json
{
  "name": "Jane Doe",
  "phone": "(386) 555-5678",
  "newsletter_opted_out": false,
  "directory_listed": true
}
```

**Response (200):**
Returns updated user object.

---

#### GET `/users` **Auth Required (Admin)**

List all users.

**Query Parameters:**
- `limit` (number): Results per page
- `offset` (number): Skip results
- `role` (string): Filter by role

**Response (200):**
Array of user objects.

---

#### PUT `/users/:id/role` **Auth Required (Admin)**

Change user role.

**Body:**
```json
{
  "role": "contributor"
}
```

**Response (200):**
Returns updated user with new role.

---

### Contact & Directory

#### POST `/contact`

Submit contact form.

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "(386) 555-1234",
  "message": "I have a question about Sunday services..."
}
```

**Response (201):**
Returns confirmation message.

**Notes:**
- Requires Turnstile verification
- Message stored in database for admin review

---

#### GET `/directory` **Auth Required**

Get church member directory (public profiles).

**Query Parameters:**
- `limit` (number): Results per page
- `offset` (number): Skip results

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "phone": "(386) 555-1234",
    "profile_image": "/uploads/profile_123.jpg"
  }
]
```

---

### File Uploads

#### POST `/uploads`

Upload image or file.

**Request Type:** `multipart/form-data`

**Form Fields:**
- `file`: Binary file content
- `type` (optional): 'post', 'event', 'profile', etc.

**Response (201):**
```json
{
  "filename": "post_1703001234567.jpg",
  "url": "/uploads/post_1703001234567.jpg",
  "size": 524288
}
```

---

## Error Codes

| Code | Meaning | Example |
|------|---------|----------|
| 400 | Bad Request | Invalid JSON, missing fields |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User lacks permission for action |
| 404 | Not Found | Resource doesn't exist |
| 422 | Unprocessable Entity | Validation error (duplicate email, etc.) |
| 500 | Server Error | Database connection failed, etc. |

---

## Rate Limiting

**Current:** No rate limiting implemented (consider adding for production)

**Recommended Limits:**
- Auth endpoints: 5 requests per minute per IP
- Contact form: 10 requests per hour per IP
- Email send: Per account daily limits in database

---

## CORS

**Allowed Origins:** `https://opendoorchristian.church` (configurable via `CORS_ORIGIN` env var)

**Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS

**Allowed Headers:** Content-Type, Authorization
