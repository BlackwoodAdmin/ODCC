# Testing Guide for ODCC Church Website

## Quick Start

```bash
# Install dependencies
npm install

# Setup test database
npm run test:setup

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/middleware/auth.test.js
```

## Test Structure

```
tests/
├── setup.js                 # Global setup, mocks, DB cleanup
├── helpers/
│   ├── db.js               # Database utilities
│   ├── auth.js             # JWT & auth helpers
│   ├── fixtures.js         # Test data
│   ├── mocks.js            # External service mocks
│   └── app.js              # Express test app
├── unit/
│   ├── middleware/
│   │   ├── auth.test.js
│   │   └── turnstile.test.js
│   ├── utils/
│   │   └── formatters.test.js
│   └── data/
│       ├── sanitize-config.test.js
│       └── email-template-wrapper.test.js
├── integration/
│   ├── routes/
│   │   └── auth.test.js
│   └── email/
│       └── email-delivery.test.js
└── component/     # (React components - add as needed)
```

## Writing Tests

### Unit Test Template
```javascript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    // Arrange, Act, Assert
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '@tests/helpers/app.js';

let app;

beforeEach(() => {
  app = createTestApp();
});

afterEach(async () => {
  await cleanupTestDb();
});

describe('API Endpoint', () => {
  it('should respond with 200', async () => {
    const res = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
  });
});
```

## Test Helpers

### Database
```javascript
import { getTestDb, cleanupTestDb, queryTestDb, createTestUser } from '@tests/helpers/db.js';

// Get database connection
const db = getTestDb();

// Run query
const result = await queryTestDb('SELECT * FROM users WHERE id = $1', [1]);

// Create test user
const { user, token } = await createTestUser({
  email: 'test@example.com',
  password: 'password123',
  role: 'admin'
});
```

### Authentication
```javascript
import { generateTestToken, authHeaders, createTestUser } from '@tests/helpers/auth.js';

// Generate token for user
const token = generateTestToken(1, 'admin');

// Get authorization headers
const headers = authHeaders(token);

// Make authenticated request
const res = await request(app)
  .get('/api/protected')
  .set(headers);
```

## Coverage

Current targets:
- **Statements**: 90%
- **Branches**: 85%
- **Functions**: 90%
- **Lines**: 90%

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

## CI/CD

Tests run automatically on:
- Push to `main` branch
- Pull requests to `main` branch

See `.github/workflows/test.yml` for configuration.

## Debugging

### Enable debug output
```bash
DEBUG=* npm test
```

### Run single test
```bash
npm test -- auth.test.js
```

### Watch specific file
```bash
npm run test:watch -- middleware/auth.test.js
```

## Common Issues

### Database connection fails
- Ensure PostgreSQL is running
- Check `TEST_DATABASE_URL` in `.env.test`
- Run `npm run test:setup` to create test database

### Tests timeout
- Increase timeout: `testTimeout: 20000` in `vitest.config.js`
- Check for hanging promises in async code

### Mock not working
- Ensure mock is defined before importing module
- Clear mocks between tests: `vi.clearAllMocks()`

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `afterEach()` to clean up
3. **Mocking**: Mock external services, not business logic
4. **Assertions**: Test behavior, not implementation
5. **Naming**: Use clear, descriptive test names
6. **Focus**: Use `it.only()` for debugging, remove before commit
7. **Skipping**: Use `it.skip()` to temporarily disable tests
