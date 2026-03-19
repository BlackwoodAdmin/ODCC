import bcrypt from 'bcryptjs';

const hash = await bcrypt.hash('password123', 10);

export const testFixtures = {
  testUser: {
    email: 'member@example.com',
    password_hash: hash,
    name: 'Test Member',
    role: 'member',
  },
  testAdmin: {
    email: 'admin@example.com',
    password_hash: hash,
    name: 'Test Admin',
    role: 'admin',
  },
  testSubscriber: {
    email: 'subscriber@example.com',
    password_hash: hash,
    name: 'Test Subscriber',
    role: 'subscriber',
  },
  testPost: {
    title: 'Test Blog Post',
    slug: 'test-blog-post',
    body: '<p>This is test content for the blog post.</p>',
    status: 'published',
  },
  testDraft: {
    title: 'Test Draft Post',
    slug: 'test-draft-post',
    body: '<p>This is a draft blog post.</p>',
    status: 'draft',
  },
  testDonation: {
    amount: 5000,
    donor_email: 'donor@example.com',
    donor_name: 'Test Donor',
    status: 'succeeded',
  },
};