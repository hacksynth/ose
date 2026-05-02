import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestUser, resetUserData, sessionFor } from '@/test/helpers';

async function loadQuestionsRoute(session: unknown = null) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/questions/route');
}

describe('GET /api/questions', () => {
  beforeEach(async () => {
    await resetUserData();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/auth');
  });

  it('returns 401 when the user is not logged in', async () => {
    const appHandler = await loadQuestionsRoute();

    await testApiHandler({
      appHandler,
      url: 'ntarh://testApiHandler/api/questions?page=1&pageSize=1',
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ message: expect.any(String) });
      },
    });
  });

  it('returns a paginated question list for a logged-in user', async () => {
    const user = await createTestUser({ id: 'questions-user', email: 'questions@example.com' });
    const appHandler = await loadQuestionsRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      url: 'ntarh://testApiHandler/api/questions?page=1&pageSize=1',
      async test({ fetch }) {
        const response = await fetch();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          items: expect.any(Array),
          pagination: {
            page: 1,
            pageSize: 1,
            total: expect.any(Number),
            totalPages: expect.any(Number),
          },
        });
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({
          id: 'test-question-1',
          options: expect.any(Array),
        });
        expect(body.items[0].options[0]).not.toHaveProperty('isCorrect');
      },
    });
  });
});
