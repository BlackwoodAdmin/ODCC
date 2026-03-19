import { vi } from 'vitest';

export function createMockSendGrid() {
  return {
    send: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
    sendMultiple: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
  };
}

export function createMockStripe() {
  return {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_secret_abc',
        status: 'requires_payment_method',
      }),
      confirm: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
      cancel: vi.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'canceled',
      }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
}

export function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'chatcmpl_test',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Generated content from AI',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 25,
            total_tokens: 35,
          },
        }),
      },
    },
  };
}

export function createMockTurnstile() {
  return {
    verify: vi.fn().mockResolvedValue({
      success: true,
      challenge_ts: new Date().toISOString(),
      hostname: 'localhost',
    }),
  };
}

export function resetAllMocks(...mocks) {
  mocks.forEach(mock => {
    if (mock && typeof mock.resetAllMocks === 'function') {
      mock.resetAllMocks();
    }
  });
}