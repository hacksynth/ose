import { testApiHandler } from 'next-test-api-route-handler';
import { beforeEach, describe, expect, it } from 'vitest';

import * as appHandler from '@/app/api/auth/register/route';
import { prisma } from '@/lib/prisma';
import { resetUserData } from '@/test/helpers';

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await resetUserData();
  });

  it('registers a new user', async () => {
    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const password = 'correct-horse';
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'new-user@example.com',
            name: 'New User',
            password,
          }),
        });

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({ message: expect.any(String) });

        const user = await prisma.user.findUnique({ where: { email: 'new-user@example.com' } });
        expect(user).toMatchObject({ email: 'new-user@example.com', name: 'New User' });
        expect(user?.password).not.toBe(password);
      },
    });
  });

  it('returns 400 for a duplicate email', async () => {
    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const payload = {
          email: 'duplicate@example.com',
          name: 'Duplicate User',
          password: 'correct-horse',
        };

        const first = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        expect(first.status).toBe(201);

        const second = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, name: 'Second User' }),
        });

        expect(second.status).toBe(400);
        await expect(second.json()).resolves.toMatchObject({ message: expect.any(String) });
      },
    });
  });
});
