# System Architecture

This document describes the technical architecture, design patterns, and system organization of the Open Door Christian Church website.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  React 18 Application (Vite Build)                   │   │
│  │  - Routes via React Router                           │   │
│  │  - Context providers (Auth, Notifications)          │   │
│  │  - Component tree with hooks                        │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
        HTTP/REST API Calls (CORS enabled)
                   │
┌──────────────────▼──────────────────────────────────────────┐
│              Express.js Server                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Middleware Stack                                    │   │
│  │  - Helmet (security headers)                        │   │
│  │  - CORS (cross-origin requests)                     │   │
│  │  - Body parsers (JSON, form data)                   │   │
│  │  - Origin check (CSRF protection)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Route Handlers                                      │   │
│  │  - /api/auth (authentication)                       │   │
│  │  - /api/posts (blog)                                │   │
│  │  - /api/events (events)                             │   │
│  │  - /api/email/* (email system)                      │   │
│  │  - /api/donations (payments)                        │   │
│  │  - /api/newsletter (campaigns)                      │   │
│  │  - /api/dashboard (admin)                           │   │
│  │  - [+ 10+ more routes]                              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Scheduled Jobs (pm2)                               │   │
│  │  - Email cron tasks                                 │   │
│  │  - Donation cleanup                                 │   │
│  │  - Newsletter processing                            │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
          Database Connection (pg driver)
                   │
┌──────────────────▼──────────────────────────────────────────┐
│              PostgreSQL Database                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Tables                                              │   │
│  │  - users                                             │   │
│  │  - posts, comments                                   │   │
│  │  - events                                            │   │
│  │  - contact_submissions                               │   │
│  │  - email_* (14 tables for email system)             │   │
│  │  - donations, donation_subscriptions                │   │
│  │  - newsletters, newsletter_sends                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### React Component Hierarchy

```
App.jsx (Router + MainLayout)
├── MainLayout
│   ├── Header
│   ├── Footer
│   └── <Route> (page component)
│
├── Public Routes
│   ├── Home
│   ├── About
│   ├── Services
│   ├── Events
│   ├── Blog (list)
│   ├── BlogPost (single)
│   ├── Give (donations)
│   ├── Contact
│   ├── JoyLadiesCircle
│   ├── Login
│   └── Register
│
├── Protected Routes (Auth required)
│   ├── Dashboard (home)
│   ├── DashboardProfile
│   ├── DashboardPosts (CRUD)
│   ├── DashboardEvents (CRUD)
│   ├── DashboardDonations
│   ├── DashboardMessages
│   ├── DashboardComments
│   ├── DashboardDirectory
│   │
│   ├── Admin Routes (Admin role required)
│   │   ├── DashboardAdminEmail
│   │   ├── DashboardAdminEmailMonitoring
│   │   ├── DashboardAdminDonations
│   │   ├── DashboardUsers
│   │   └── DashboardNewsletter
│   │
│   └── Email System Routes
│       ├── DashboardEmail (inbox/compose)
│       └── Email sub-components
│           ├── MessageList
│           ├── MessageView
│           ├── Compose
│           ├── FolderSidebar
│           ├── ContactPicker
│           └── SearchBar
```

### State Management

**Context Providers** (in `src/contexts/`):

- **AuthContext**: User authentication state, roles, login/logout
- **NotificationContext**: Toast notifications and alerts

**Local Component State**: Individual pages and components manage their own state with `useState`

**API Service Layer** (`src/services/api.js`):

Centralized HTTP client for all API calls:
```javascript
// Example usage
await api.get('/api/posts')
await api.post('/api/posts', {title: '...', content: '...'})
await api.put(`/api/posts/${id}`, updatedData)
await api.delete(`/api/posts/${id}`)
```

### Custom Hooks

- **useAuth()**: Access current user and auth state
- **useFetch()**: Generic fetch hook with loading/error states
- **useEmail()**: Email system state and actions
- **useNotification()**: Toast notifications
- **useExitIntent()**: Trigger exit popups

## Backend Architecture

### Express Server Structure

**Entry Point** (`server/index.js`):
- Initializes middleware stack (Helmet, CORS, body parsers)
- Registers all API routes
- Serves static frontend files
- Initializes database and cron jobs
- Listens on PORT (default 3000)

### Route Organization

Each feature has a dedicated route file in `server/routes/`:

| Route | Purpose | Auth | Features |
|-------|---------|------|----------|
| auth.js | User registration, login, password reset | JWT | Registration, login, forgot password, reset token |
| posts.js | Blog post CRUD | JWT (owner/admin) | Create, read, update, delete, publish |
| events.js | Event management | JWT (owner/admin) | CRUD, recurrence |
| comments.js | Blog comments | Public/JWT | Submit, approve, delete |
| contact.js | Contact form submissions | Public | Submit, admin retrieve |
| users.js | User management | JWT (admin) | List, update roles, delete |
| donations.js | Stripe integration | Public/JWT | Create payment intent, webhook handler, receipts |
| newsletter.js | Email campaigns | JWT (admin) | Create, send, manage subscribers |
| email-accounts.js | Email account setup | JWT | Create, update, delete accounts |
| email-messages.js | Email CRUD | JWT | Send, receive, archive, delete |
| email-folders.js | Folder management | JWT | Create custom folders |
| email-auto-reply.js | Out-of-office replies | JWT | Configure auto-replies |
| email-audit.js | Email activity logging | JWT (admin) | View audit logs |
| ai.js | OpenAI integration | JWT | Content suggestions |
| uploads.js | File uploads | JWT | Handle image/file uploads |
| dashboard.js | Admin dashboard stats | JWT (admin) | Statistics and metrics |

### Database Layer

**File:** `server/db.js`

```javascript
export { pool }           // PostgreSQL connection pool
export { query }          // Direct SQL execution
export initializeDatabase // Schema initialization
```

**Features:**
- Self-initializing schema (CREATE TABLE IF NOT EXISTS)
- Automatic index creation
- Schema migrations (ALTER TABLE)
- Connection pooling

### Authentication & Authorization

**JWT Flow:**

1. User registers/logs in → password hashed with bcryptjs
2. Server creates JWT token with user ID and role
3. Client stores token in localStorage
4. Client sends token in `Authorization: Bearer <token>` header
5. Server middleware verifies token and populates `req.user`
6. Route handlers check `req.user.role` for authorization

**Middleware** (`server/middleware/`):

- **auth.js**: Verify JWT token, populate `req.user`
- **origin-check.js**: CSRF protection for public mutation endpoints
- **turnstile.js**: Cloudflare Turnstile verification for forms

### Email System Architecture

A sophisticated in-app email client with:

**Email Accounts:**
- Multiple email addresses per user
- Display names and signatures
- Forwarding rules and auto-replies
- Quota management (MB limits)
- Daily send limits

**Email Features:**
- Folders (inbox, sent, drafts, custom)
- Message threading and conversation grouping
- Attachments (with storage and retrieval)
- Contacts management
- Auto-replies with date ranges
- Audit logging of all actions
- System logs for debugging

**Integration:**
- SendGrid for outbound SMTP
- Webhook handling for inbound emails
- Email parsing and storage
- Sanitized HTML rendering

### Payment Processing (Stripe)

**Flow:**

1. Client initiates donation → creates Stripe Payment Intent
2. Client opens Stripe payment modal
3. User enters payment details
4. Stripe confirms payment → webhook sent to server
5. Server verifies webhook signature and updates donation record
6. Email receipt sent to donor

**Recurring Donations:**
- Stripe Subscription model
- Stored subscription ID for management
- Automatic webhook handling for subscription events

### Scheduled Jobs (Cron)

**File:** `server/cron/`

- **email-cron.js**: Process email queues, handle retries
- **donation-cleanup.js**: Clean up expired payment intents

**Execution:** PM2 manages cron jobs alongside main server process

## Data Flow Examples

### Blog Post Creation

```
1. User fills form in DashboardPosts component
2. Form submission → POST /api/posts
3. Server auth middleware verifies JWT token
4. Route handler validates data
5. Query: INSERT INTO posts (...)
6. Database returns new post with id
7. Server responds with 201 + post data
8. Client updates UI and navigates to edit page
```

### Email Message Send

```
1. User composes email in DashboardEmail
2. User clicks Send → POST /api/email/messages
3. Server validates recipient and account
4. Server creates message record with is_draft=false
5. Server queues email via SendGrid
6. Server returns message with status='sending'
7. Client updates UI (message in sent folder)
8. SendGrid delivers email
9. (Optional) Webhook confirms delivery
```

### Donation with Stripe

```
1. User enters amount in Give page
2. Client calls POST /api/donations/create-payment-intent
3. Server creates Stripe PaymentIntent
4. Server returns clientSecret
5. Client initializes Stripe payment element
6. User confirms payment in modal
7. Stripe processes charge
8. Stripe sends webhook to /api/donations/webhook
9. Server verifies webhook signature
10. Server updates donation record with status='completed'
11. Server sends email receipt
```

## Performance & Optimization

### Frontend
- Vite code splitting for faster page loads
- React lazy loading for routes
- Component memoization for expensive renders
- Image optimization with Sharp

### Backend
- Connection pooling (PostgreSQL)
- Database indexing on frequently queried columns
- Query optimization (avoid N+1 problems)
- Caching headers for static assets
- Compression middleware

### Database
- Strategic indexing on foreign keys and frequently filtered columns
- Partial indexes for WHERE conditions
- Full-text search indexes for email body search
- Query result limits (pagination)

## Security Measures

- **HTTPS**: All production traffic encrypted
- **CORS**: Whitelist trusted origins
- **CSRF**: Origin check middleware on public mutation endpoints
- **Input Validation**: Sanitize all user inputs
- **SQL Injection Prevention**: Parameterized queries via pg driver
- **Password Security**: bcryptjs hashing (10 salt rounds)
- **JWT**: Secure token-based authentication
- **Email Validation**: SendGrid webhook signature verification
- **Payment Security**: Stripe webhook signature verification
- **Helmet**: Security headers (CSP, XSS protection, etc.)
- **Turnstile**: Bot protection on public forms

## Deployment & Scaling

### Current Setup
- **Hosting**: Cloud VPS (Linux)
- **Process Manager**: PM2
- **Web Server**: Nginx (reverse proxy)
- **Database**: PostgreSQL (managed service)
- **Storage**: Local filesystem (/data for attachments)

### Scaling Considerations
- Separate database from application server
- Use S3 or cloud storage for uploads
- Implement Redis for session caching
- Use CDN for static assets
- Load balance multiple application instances
- Email queue system for high volume
