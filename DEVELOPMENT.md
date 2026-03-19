# Development Guide

Instructions for local development, testing, and contributing to the project.

## Prerequisites

- **Node.js** 16+ (check with `node -v`)
- **npm** 7+ (check with `npm -v`)
- **PostgreSQL** 12+ (local or remote)
- **Git** for version control
- **VS Code** (recommended editor)

## Local Setup

### 1. Clone Repository

```bash
git clone https://github.com/opendoorchristian/website.git
cd website
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Environment File

```bash
cp .env.example .env
```

### 4. Configure Environment Variables

Edit `.env` with your local values:

```env
DATABASE_URL=postgresql://localhost:5432/church_dev
PORT=3000
NODE_ENV=development
JWT_SECRET=your-dev-secret-key-here
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
TURNSTILE_SITE_KEY=1x00000000000000000000AA
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx
OPENAI_API_KEY=sk-xxxxx
```

**Note:** Use test keys from Stripe, Turnstile, and SendGrid dashboards for development.

### 5. Database Setup

**Option A: Local PostgreSQL**

```bash
creatdb church_dev
npm run dev
```

**Option B: Docker PostgreSQL**

```bash
docker run --name church-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=church_dev -p 5432:5432 -d postgres:15
```

### 6. Start Development Server

```bash
npm run dev
```

**Frontend:** http://localhost:5173 (Vite dev server)  
**Backend:** http://localhost:3000 (Express server)

## Project Structure

```
src/
├── pages/          # Route pages
├── components/     # Reusable components
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
├── services/       # API client
├── utils/          # Utility functions
└── index.css       # Global styles

server/
├── index.js        # Express entry
├── db.js           # Database layer
├── routes/         # API endpoints
├── middleware/     # Express middleware
├── cron/           # Scheduled jobs
├── utils/          # Server utilities
└── data/           # Templates, configs
```

## Coding Standards

### Frontend

**File Naming:**
- Components: PascalCase (`UserProfile.jsx`)
- Utilities: camelCase (`formatDate.js`)
- Hooks: `use` prefix (`useAuth.js`)

**Component Pattern:**

```jsx
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function MyComponent() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  return <div>{/* JSX */}</div>;
}
```

**Styling:**
- Use Tailwind CSS utility classes
- Add custom CSS in `src/index.css` for complex styles
- Use CSS variables for theme colors

### Backend

**Route Handler Pattern:**

```javascript
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM table');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
```

**Database Queries:**

Always use parameterized queries:

```javascript
// GOOD
await query('SELECT * FROM posts WHERE id = $1', [id]);

// BAD - SQL injection risk!
await query(`SELECT * FROM posts WHERE id = ${id}`);
```

## Testing

### Manual Testing

1. Register a user at `/register`
2. Create a blog post in Dashboard
3. Test email sending in dev logs
4. Test Stripe with card: 4242 4242 4242 4242

### Debugging

**Frontend:**
- Use React DevTools browser extension
- Add `console.log()` statements
- Use `debugger;` statement to pause execution

**Backend:**
```bash
node --inspect server/index.js
# Open chrome://inspect in browser
```

## Database

**View schema:**
```bash
psql "$DATABASE_URL" -c "\dt"
```

**Reset database:**
```bash
dropdb church_dev
creatdb church_dev
npm run dev
```

## Build & Deployment

```bash
npm run build        # Build for production
npm start            # Start production server
pm2 start ecosystem.config.js  # Start with PM2
```

## Git Workflow

```bash
git checkout -b feature/user-profiles
git add .
git commit -m "feat: add user profile page"
git push origin feature/user-profiles
```

## Troubleshooting

### "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "CORS error"
- Check CORS_ORIGIN in `.env`
- Verify frontend/backend URLs match
- Ensure `cors()` middleware in `server/index.js`

### "Database connection refused"
```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

### "JWT token invalid"
- Check JWT_SECRET matches both frontend and backend
- Verify token in Authorization header
- Check token hasn't expired

## Useful Resources

- [React Docs](https://react.dev)
- [Express.js Docs](https://expressjs.com)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Tailwind CSS](https://tailwindcss.com)
- [Stripe Documentation](https://stripe.com/docs)
- [SendGrid API Docs](https://docs.sendgrid.com/)
