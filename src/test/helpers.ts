import { prisma } from '@/lib/prisma';

const TEST_PASSWORD_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.lVvnV4dEDqQ3oYBE1zxOzl1sQVIu';

export async function resetUserData() {
  await prisma.user.deleteMany();
}

export async function createTestUser(
  overrides: Partial<{ id: string; email: string; name: string }> = {}
) {
  return prisma.user.create({
    data: {
      id: overrides.id ?? `test-user-${Date.now()}`,
      email: overrides.email ?? `user-${Date.now()}@example.com`,
      name: overrides.name ?? 'Test User',
      password: TEST_PASSWORD_HASH,
    },
  });
}

export function sessionFor(user: { id: string; email: string; name: string }) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}
