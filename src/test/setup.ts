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

async function seedCaseQuestion() {
  await prisma.question.upsert({
    where: { id: 'test-case-question-1' },
    update: {
      content: 'A company needs to design a database management system for its operations.',
      type: 'CASE_ANALYSIS',
    },
    create: {
      id: 'test-case-question-1',
      content: 'A company needs to design a database management system for its operations.',
      type: 'CASE_ANALYSIS',
      difficulty: 2,
      year: 2097,
      session: 'PM',
      questionNumber: 1,
      explanation: 'Database design involves ER modeling and normalization.',
      knowledgePointId: 'test-child',
      isAIGenerated: false,
      aiGeneratedBy: null,
      createdByUserId: null,
    },
  });

  await prisma.caseScenario.upsert({
    where: { questionId: 'test-case-question-1' },
    update: { background: 'A company has products, customers, and orders. Design an appropriate database.' },
    create: {
      id: 'test-case-scenario-1',
      questionId: 'test-case-question-1',
      background: 'A company has products, customers, and orders. Design an appropriate database.',
    },
  });

  for (const sub of [
    {
      id: 'test-sub-q-1',
      subNumber: 1,
      content: 'Design the ER diagram for the company database.',
      answerType: 'SHORT_ANSWER' as const,
      referenceAnswer: 'entities relationships keys primary foreign',
      score: 5,
      explanation: 'Identify entities, attributes, and relationships.',
    },
    {
      id: 'test-sub-q-2',
      subNumber: 2,
      content: 'Normalize the schema to 3NF.',
      answerType: 'SHORT_ANSWER' as const,
      referenceAnswer: 'normalization normal form functional dependency',
      score: 5,
      explanation: 'Apply normalization rules to remove redundancy.',
    },
  ]) {
    await prisma.caseSubQuestion.upsert({
      where: { id: sub.id },
      update: { referenceAnswer: sub.referenceAnswer },
      create: { ...sub, caseScenarioId: 'test-case-scenario-1' },
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
  await seedCaseQuestion();
}

const globalForSetup = globalThis as typeof globalThis & {
  __OSE_TEST_DB_READY__?: Promise<void>;
};

globalForSetup.__OSE_TEST_DB_READY__ ??= prepareDatabase();
await globalForSetup.__OSE_TEST_DB_READY__;
