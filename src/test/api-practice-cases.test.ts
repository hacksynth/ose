import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
  TEST_CASE_QUESTION_ID,
  TEST_CASE_SUB_IDS,
  createTestUser,
  resetUserData,
  sessionFor,
} from '@/test/helpers';

async function loadCasesRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/cases/route');
}

async function loadCaseAnswerRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/cases/[id]/answer/route');
}

async function loadCaseResultRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/cases/[id]/result/route');
}

afterEach(() => {
  vi.doUnmock('@/lib/auth');
});

describe('GET /api/practice/cases', () => {
  beforeEach(resetUserData);

  it('lists available case questions with answered=false for a fresh user', async () => {
    const user = await createTestUser({ id: 'cases-list-u1', email: 'cases-list@example.com' });
    const appHandler = await loadCasesRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.cases)).toBe(true);
        expect(body.cases.length).toBeGreaterThan(0);

        const caseItem = body.cases.find((c: { id: string }) => c.id === TEST_CASE_QUESTION_ID);
        expect(caseItem).toBeDefined();
        expect(caseItem?.answered).toBe(false);
        expect(typeof caseItem?.score).toBe('number');
      },
    });
  });

  it('marks the case as answered when the user has a saved sub-question answer', async () => {
    const user = await createTestUser({ id: 'cases-list-u2', email: 'cases-list2@example.com' });
    await prisma.userCaseAnswer.create({
      data: {
        userId: user.id,
        caseSubQuestionId: TEST_CASE_SUB_IDS[0],
        answer: 'My answer',
        score: 3,
        feedback: 'Good',
      },
    });
    const appHandler = await loadCasesRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        const caseItem = body.cases.find((c: { id: string }) => c.id === TEST_CASE_QUESTION_ID);
        expect(caseItem?.answered).toBe(true);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadCasesRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('POST /api/practice/cases/[id]/answer', () => {
  beforeEach(resetUserData);

  it('grades with local keyword fallback when AI is not configured', async () => {
    const user = await createTestUser({ id: 'case-ans-u1', email: 'case-ans@example.com' });
    const subQuestions = await prisma.caseSubQuestion.findMany({
      where: { caseScenarioId: 'test-case-scenario-1' },
    });
    const appHandler = await loadCaseAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            answers: subQuestions.map((sub) => ({
              caseSubQuestionId: sub.id,
              answer: 'entities relationships keys primary foreign normalization',
            })),
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.gradedBy).toBe('keyword');
        expect(typeof body.totalScore).toBe('number');
        expect(typeof body.maxScore).toBe('number');
        expect(Array.isArray(body.results)).toBe(true);
        expect(body.results.length).toBe(subQuestions.length);
        for (const result of body.results) {
          expect(typeof result.score).toBe('number');
          expect(result.score).toBeGreaterThanOrEqual(0);
        }
      },
    });

    const saved = await prisma.userCaseAnswer.findMany({ where: { userId: user.id } });
    expect(saved.length).toBe(subQuestions.length);
  });

  it('upserts answers so repeated submissions overwrite previous ones', async () => {
    const user = await createTestUser({ id: 'case-ans-u2', email: 'case-ans2@example.com' });
    const subQuestions = await prisma.caseSubQuestion.findMany({
      where: { caseScenarioId: 'test-case-scenario-1' },
    });
    const appHandler = await loadCaseAnswerRoute(sessionFor(user));

    const submit = async (answer: string) =>
      testApiHandler({
        appHandler,
        params: { id: TEST_CASE_QUESTION_ID },
        async test({ fetch }) {
          const response = await fetch({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              answers: [{ caseSubQuestionId: subQuestions[0].id, answer }],
            }),
          });
          expect(response.status).toBe(200);
        },
      });

    await submit('first answer attempt');
    await submit('second answer attempt updated');

    const saved = await prisma.userCaseAnswer.findMany({
      where: { userId: user.id, caseSubQuestionId: subQuestions[0].id },
    });
    expect(saved.length).toBe(1);
    expect(saved[0].answer).toBe('second answer attempt updated');
  });

  it('returns 400 when no answers are provided', async () => {
    const user = await createTestUser({ id: 'case-ans-u3', email: 'case-ans3@example.com' });
    const appHandler = await loadCaseAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: [] }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 404 for a non-existent case question', async () => {
    const user = await createTestUser({ id: 'case-ans-u4', email: 'case-ans4@example.com' });
    const appHandler = await loadCaseAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: 'non-existent-question-id' },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: [{ caseSubQuestionId: 'sub-1', answer: 'test' }] }),
        });
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadCaseAnswerRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: [{ caseSubQuestionId: 'sub-1', answer: 'answer' }] }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/practice/cases/[id]/result', () => {
  beforeEach(resetUserData);

  it('returns the saved case answers for the user', async () => {
    const user = await createTestUser({ id: 'case-res-u1', email: 'case-res@example.com' });
    await prisma.userCaseAnswer.create({
      data: {
        userId: user.id,
        caseSubQuestionId: TEST_CASE_SUB_IDS[0],
        answer: 'My ER diagram answer',
        score: 4,
        feedback: 'Good coverage of entities',
      },
    });
    const appHandler = await loadCaseResultRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(typeof body.totalScore).toBe('number');
        expect(typeof body.maxScore).toBe('number');
        expect(Array.isArray(body.results)).toBe(true);

        const sub = body.results.find(
          (r: { subQuestionId: string }) => r.subQuestionId === TEST_CASE_SUB_IDS[0]
        );
        expect(sub?.score).toBe(4);
        expect(sub?.answer).toBe('My ER diagram answer');
      },
    });
  });

  it('returns null scores when no answers have been submitted yet', async () => {
    const user = await createTestUser({ id: 'case-res-u2', email: 'case-res2@example.com' });
    const appHandler = await loadCaseResultRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.totalScore).toBe(0);
        for (const r of body.results) {
          expect(r.score).toBeNull();
        }
      },
    });
  });

  it('returns 404 for a non-existent case question', async () => {
    const user = await createTestUser({ id: 'case-res-u3', email: 'case-res3@example.com' });
    const appHandler = await loadCaseResultRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: 'non-existent-question' },
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadCaseResultRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: TEST_CASE_QUESTION_ID },
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});
