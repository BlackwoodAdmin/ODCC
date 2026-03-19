# Test Suite Quick Start

## 🚀 Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/middleware/auth.test.js

# Run with coverage
npm run test:coverage

# Watch mode (re-run on changes)
npm run test:watch
```

## ✅ Test Suite Overview

The comprehensive test suite includes:

### Unit Tests (70+ tests)
- **Middleware**: Auth, Turnstile, Origin check
- **Utilities**: Formatters, validators, helpers  
- **Data**: Sanitization, email templates, configs

### Integration Tests (40+ tests)
- **Authentication Routes**: Register, login, password reset
- **Content Routes**: Posts, comments, CRUD operations
- **Donations**: Payment intents, recurring donations
- **Email Delivery**: Internal delivery, rate limiting
- **API Error Handling**: 400, 401, 403, 404, 500 responses
- **Database**: Transactions, constraints, concurrency
- **Rate Limiting**: Login, password reset limits

### Component Tests (Ready to add)
- Auth forms, donation forms, dashboards, editors

## 📊 Coverage Targets

| Metric | Target | Status |
|--------|--------|--------|
| Statements | 90% | ✅ Setup |
| Branches | 85% | ✅ Setup |
| Functions | 90% | ✅ Setup |
| Lines | 90% | ✅ Setup |

## 📁 Test Structure

```
tests/
├── setup.js              # Global mocks & DB setup
├── helpers/              # Reusable test utilities
│   ├── db.js            # Database helpers
│   ├── auth.js          # JWT & token helpers
│   ├── fixtures.js      # Test data
│   ├── mocks.js         # Service mocks
│   └── app.js           # Express test app
├── unit/                 # Unit tests
│   ├── middleware/
│   ├── utils/
│   └── data/
├── integration/          # Integration tests
│   ├── routes/
│   ├── email/
│   ├── api-error-handling.test.js
│   ├── rate-limiting.test.js
│   ├── database-transactions.test.js
│   └── auth-flow.test.js
└── component/           # React component tests (add as needed)
```

## 🔧 Test Infrastructure

### Configuration
- **vitest.config.js**: Vitest settings, aliases, coverage thresholds
- **.env.test**: Test environment variables
- **tests/setup.js**: Global mocks, DB connection, cleanup hooks

### Database
- PostgreSQL test database (optional - tests skip if unavailable)
- Automatic table cleanup after each test
- Foreign key constraints enforced

### Mocks
- **SendGrid**: Email service
- **Stripe**: Payment processing
- **OpenAI**: Content generation
- **Turnstile**: CAPTCHA verification
- **Fetch**: HTTP requests

## 💡 Writing Tests

### Unit Test Example
```javascript
import { describe, it, expect } from 'vitest';
import { someFunction } from '@server/module.js';

describe('someFunction', () => {
  it('should do something', () => {
    const result = someFunction();
    expect(result).toBe(expected);
  });
});
```

### Integration Test Example
```javascript
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { cleanupTestDb } from '@tests/helpers/db.js';
import { createTestUser } from '@tests/helpers/auth.js';

let app;

afterEach(async () => {
  await cleanupTestDb();
});

describe('POST /api/endpoint', () => {
  it('should respond with 200', async () => {
    const { token } = await createTestUser();
    
    const res = await request(app)
      .post('/api/endpoint')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: 'value' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

## 🔗 Test Helpers

### Database
```javascript
import { getTestDb, cleanupTestDb, queryTestDb } from '@tests/helpers/db.js';

const db = getTestDb();
const result = await queryTestDb('SELECT * FROM users');
await cleanupTestDb();
```

### Authentication
```javascript
import { generateTestToken, createTestUser, authHeaders } from '@tests/helpers/auth.js';

const token = generateTestToken(1, 'admin');
const { user, token } = await createTestUser({ role: 'admin' });
const headers = authHeaders(token);
```

## 🐛 Debugging

```bash
# Run single test file
npm test -- tests/unit/middleware/auth.test.js

# Run tests matching pattern
npm test -- --grep "should authenticate"

# Watch specific file
npm run test:watch -- middleware/auth.test.js

# View HTML coverage report
open coverage/index.html
```

## 🔄 CI/CD

Tests run automatically on:
- Push to `main` branch
- Pull requests to `main` branch

See `.github/workflows/test.yml`

## 📝 Notes

- Tests use **Vitest** for fast, parallel execution
- **Supertest** for HTTP endpoint testing
- **Mocking** prevents external API calls
- **Database cleanup** ensures test isolation
- Tests are **independent** and can run in any order

## Next Steps

1. ✅ Test infrastructure complete
2. ⏳ Add React component tests (tests/component/*.test.jsx)
3. ⏳ Increase database integration coverage
4. ⏳ Add E2E tests for critical flows
