import { describe, it, expect } from 'vitest';
import {
  validateDonationInput,
  generateReceiptNumber,
  getSubscriptionIdFromInvoice,
} from '../../server/routes/donations.js';

const base = { amount: '50.00', type: 'one_time', name: 'Jane Doe', email: 'jane@test.local' };

describe('validateDonationInput', () => {
  it('accepts a valid one-time donation', () => {
    expect(validateDonationInput(base)).toEqual([]);
  });

  it('accepts a valid recurring donation with weekly frequency', () => {
    expect(validateDonationInput({ ...base, type: 'recurring', frequency: 'week' })).toEqual([]);
  });

  it('accepts a valid recurring donation with monthly frequency', () => {
    expect(validateDonationInput({ ...base, type: 'recurring', frequency: 'month' })).toEqual([]);
  });

  it('accepts a valid recurring donation without explicit frequency (route defaults it)', () => {
    expect(validateDonationInput({ ...base, type: 'recurring' })).toEqual([]);
  });

  it('rejects recurring with invalid frequency', () => {
    const errors = validateDonationInput({ ...base, type: 'recurring', frequency: 'yearly' });
    expect(errors[0]).toMatch(/Frequency must be week or month/);
  });

  it('rejects non-numeric amount', () => {
    expect(validateDonationInput({ ...base, amount: 'abc' })[0]).toMatch(/Amount must be/);
  });

  it('rejects amount with more than 2 decimals', () => {
    expect(validateDonationInput({ ...base, amount: '50.123' })[0]).toMatch(/Amount must be/);
  });

  it('rejects amount below minimum ($1)', () => {
    expect(validateDonationInput({ ...base, amount: '0.99' })[0]).toMatch(/between \$1.00 and \$50,000/);
  });

  it('rejects amount above maximum ($50,000)', () => {
    expect(validateDonationInput({ ...base, amount: '50001' })[0]).toMatch(/between \$1.00 and \$50,000/);
  });

  it('accepts amount at both boundaries', () => {
    expect(validateDonationInput({ ...base, amount: '1' })).toEqual([]);
    expect(validateDonationInput({ ...base, amount: '50000' })).toEqual([]);
  });

  it('rejects invalid type', () => {
    expect(validateDonationInput({ ...base, type: 'gift' })[0]).toMatch(/Type must be/);
  });

  it('rejects missing name', () => {
    expect(validateDonationInput({ ...base, name: '   ' })[0]).toMatch(/Name is required/);
  });

  it('rejects name longer than 255 chars', () => {
    expect(validateDonationInput({ ...base, name: 'a'.repeat(256) })[0]).toMatch(/255 characters or less/);
  });

  it('rejects invalid email', () => {
    expect(validateDonationInput({ ...base, email: 'not-an-email' })[0]).toMatch(/valid email/);
  });

  it('rejects note longer than 500 chars', () => {
    expect(validateDonationInput({ ...base, note: 'x'.repeat(501) })[0]).toMatch(/500 characters or less/);
  });

  it('accepts optional note', () => {
    expect(validateDonationInput({ ...base, note: 'In memory of grandma' })).toEqual([]);
  });
});

describe('generateReceiptNumber', () => {
  it('formats with current year and 6-digit zero-padded id', () => {
    const year = new Date().getFullYear();
    expect(generateReceiptNumber(42)).toBe(`ODCC-${year}-000042`);
  });

  it('handles large ids without truncating', () => {
    const year = new Date().getFullYear();
    expect(generateReceiptNumber(1234567)).toBe(`ODCC-${year}-1234567`);
  });
});

describe('getSubscriptionIdFromInvoice (Stripe 2025+ shape)', () => {
  it('extracts subscription ID from invoice.parent.subscription_details', () => {
    const invoice = { parent: { subscription_details: { subscription: 'sub_abc' } } };
    expect(getSubscriptionIdFromInvoice(invoice)).toBe('sub_abc');
  });

  it('returns null when parent is missing', () => {
    expect(getSubscriptionIdFromInvoice({})).toBeNull();
  });

  it('returns null when subscription_details is missing', () => {
    expect(getSubscriptionIdFromInvoice({ parent: {} })).toBeNull();
  });

  it('returns null when subscription is not a subscription invoice', () => {
    expect(getSubscriptionIdFromInvoice({ parent: { subscription_details: null } })).toBeNull();
  });
});
