import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { prisma } from '@/lib/prisma';

const require = createRequire(import.meta.url);
const testDatabaseUrl = 'file:./test.db';
process.env.DATABASE_URL = testDatabaseUrl;

async function seedMinimalQuestionBank() {
  await prisma.knowledgePoint.upsert({
    where: { id: 'test-root' },
    update: {
      name: 'Test Fundamentals',
      parentId: null,
      sortOrder: 1,
      description: 'Seeded root knowledge point for API tests',
    },
    create: {
      id: 'test-root',
      name: 'Test Fundamentals',
      sortOrder: 1,
      description: 'Seeded root knowledge point for API tests',
    },
  });

  await prisma.knowledgePoint.upsert({
    where: { id: 'test-child' },
    update: {
      name: 'Test Topic',
      parentId: 'test-root',
      sortOrder: 1,
      description: 'Seeded child knowledge point for API tests',
    },
    create: {
      id: 'test-child',
      name: 'Test Topic',
      parentId: 'test-root',
      sortOrder: 1,
      description: 'Seeded child knowledge point for API tests',
    },
  });

  await prisma.question.upsert({
    where: { id: 'test-question-1' },
    update: {
      content: 'Which option is correct in the seeded API test question?',
      type: 'CHOICE',
      difficulty: 1,
      year: 2098,
      session: 'AM',
      questionNumber: 1,
      explanation: 'Option A is marked correct in the minimal test seed.',
      knowledgePointId: 'test-child',
      isAIGenerated: false,
      aiGeneratedBy: null,
      createdByUserId: null,
    },
    create: {
      id: 'test-question-1',
      content: 'Which option is correct in the seeded API test question?',
      type: 'CHOICE',
      difficulty: 1,
      year: 2098,
      session: 'AM',
      questionNumber: 1,
      explanation: 'Option A is marked correct in the minimal test seed.',
      knowledgePointId: 'test-child',
      options: {
        create: [
          { label: 'A', content: 'Correct answer', isCorrect: true },
          { label: 'B', content: 'Incorrect answer', isCorrect: false },
          { label: 'C', content: 'Incorrect answer', isCorrect: false },
          { label: 'D', content: 'Incorrect answer', isCorrect: false },
        ],
      },
    },
  });

  for (const option of [
    { label: 'A', content: 'Correct answer', isCorrect: true },
    { label: 'B', content: 'Incorrect answer', isCorrect: false },
    { label: 'C', content: 'Incorrect answer', isCorrect: false },
    { label: 'D', content: 'Incorrect answer', isCorrect: false },
  ]) {
    await prisma.questionOption.upsert({
      where: { questionId_label: { questionId: 'test-question-1', label: option.label } },
      update: { content: option.content, isCorrect: option.isCorrect },
      create: { questionId: 'test-question-1', ...option },
    });
  }
}

async function prepareDatabase() {
  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'src/prisma/schema.prisma'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
    }
  );
  await seedMinimalQuestionBank();
}

const globalForSetup = globalThis as typeof globalThis & {
  __OSE_TEST_DB_READY__?: Promise<void>;
};

globalForSetup.__OSE_TEST_DB_READY__ ??= prepareDatabase();
await globalForSetup.__OSE_TEST_DB_READY__;
