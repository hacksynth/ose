import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'CUSTOM_API_KEY',
  'CUSTOM_MODEL',
  'CUSTOM_BASE_URL',
] as const;

function clearAIEnv() {
  for (const key of AI_ENV_KEYS) delete process.env[key];
}

async function loadStatusRoute(session: unknown = null) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/ai/status/route');
}

describe('GET /api/ai/status', () => {
  beforeEach(() => {
    clearAIEnv();
  });

  afterEach(() => {
    clearAIEnv();
    vi.doUnmock('@/lib/auth');
  });

  it('returns configured false when no provider is configured', async () => {
    const appHandler = await loadStatusRoute();

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
          configured: false,
          provider: null,
        });
      },
    });
  });

  it('returns configured true for an env-configured provider', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_MODEL = 'gpt-test';
    const appHandler = await loadStatusRoute();

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          configured: true,
          provider: 'OpenAI',
          model: 'gpt-test',
          source: 'env',
        });
      },
    });
  });
});
