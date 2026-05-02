import { prisma } from '@/lib/prisma';

const TEST_PASSWORD_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.lVvnV4dEDqQ3oYBE1zxOzl1sQVIu';

export const TEST_CASE_QUESTION_ID = 'test-case-question-1';
export const TEST_CASE_SCENARIO_ID = 'test-case-scenario-1';
export const TEST_CASE_SUB_IDS = ['test-sub-q-1', 'test-sub-q-2'] as const;

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

export async function createTestExam(
  userId: string,
  questionIds: string[] = ['test-question-1']
) {
  return prisma.exam.create({
    data: {
      title: 'Test Mock Exam',
      type: 'MOCK',
      session: 'AM',
      timeLimit: 150,
      totalScore: questionIds.length,
      createdByUserId: userId,
      questions: {
        create: questionIds.map((qId, i) => ({ questionId: qId, orderNumber: i + 1 })),
      },
    },
  });
}

export async function createTestPracticeSession(
  userId: string,
  questionIds: string[] = ['test-question-1']
) {
  return prisma.practiceSession.create({
    data: {
      userId,
      mode: 'random',
      total: questionIds.length,
      questions: {
        create: questionIds.map((id, i) => ({ questionId: id, order: i + 1 })),
      },
    },
  });
}
