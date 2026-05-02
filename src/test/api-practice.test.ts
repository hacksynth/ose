import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
  createTestPracticeSession,
  createTestUser,
  resetUserData,
  sessionFor,
} from '@/test/helpers';

async function loadStartRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/start/route');
}

async function loadAnswerRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/answer/route');
}

async function loadSummaryRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/practice/summary/route');
}

afterEach(() => {
  vi.doUnmock('@/lib/auth');
});

describe('POST /api/practice/start', () => {
  beforeEach(resetUserData);

  it('creates a random-mode practice session and strips correct-answer flags', async () => {
    const user = await createTestUser({ id: 'prac-start-u1', email: 'prac-start@example.com' });
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'random', limit: 5 }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.sessionId).toBeDefined();
        expect(Array.isArray(body.questions)).toBe(true);
        expect(body.questions.length).toBeGreaterThan(0);
        for (const q of body.questions) {
          expect(q).not.toHaveProperty('isCorrect');
          for (const opt of q.options ?? []) {
            expect(opt).not.toHaveProperty('isCorrect');
          }
        }

        const saved = await prisma.practiceSession.findUnique({ where: { id: body.sessionId } });
        expect(saved?.userId).toBe(user.id);
        expect(saved?.mode).toBe('random');
      },
    });
  });

  it('creates a sequential-mode session with a single question', async () => {
    const user = await createTestUser({ id: 'prac-start-u2', email: 'prac-start2@example.com' });
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'sequential', limit: 1 }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.questions.length).toBe(1);
      },
    });
  });

  it('returns 400 for an invalid mode', async () => {
    const user = await createTestUser({ id: 'prac-start-u3', email: 'prac-start3@example.com' });
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'invalid-mode' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadStartRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'random' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('POST /api/practice/answer', () => {
  beforeEach(resetUserData);

  it('records a correct answer without creating a wrong note', async () => {
    const user = await createTestUser({ id: 'prac-ans-u1', email: 'prac-ans@example.com' });
    const session = await createTestPracticeSession(user.id);
    const correctOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: true },
    });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            questionId: 'test-question-1',
            selectedOptionId: correctOption.id,
            timeSpent: 30,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.isCorrect).toBe(true);
        expect(body.correctOptionId).toBe(correctOption.id);
        expect(body.explanation).toBeDefined();
      },
    });

    const wrongNote = await prisma.wrongNote.findFirst({
      where: { userId: user.id, questionId: 'test-question-1' },
    });
    expect(wrongNote).toBeNull();
  });

  it('records a wrong answer and auto-creates a wrong note', async () => {
    const user = await createTestUser({ id: 'prac-ans-u2', email: 'prac-ans2@example.com' });
    const session = await createTestPracticeSession(user.id);
    const wrongOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: false },
    });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            questionId: 'test-question-1',
            selectedOptionId: wrongOption.id,
            timeSpent: 20,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.isCorrect).toBe(false);
      },
    });

    const wrongNote = await prisma.wrongNote.findFirst({
      where: { userId: user.id, questionId: 'test-question-1' },
    });
    expect(wrongNote).not.toBeNull();
    expect(wrongNote?.markedMastered).toBe(false);
  });

  it('marks the session as completed when the last question is answered', async () => {
    const user = await createTestUser({ id: 'prac-ans-u3', email: 'prac-ans3@example.com' });
    const session = await createTestPracticeSession(user.id, ['test-question-1']);
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1' },
    });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            questionId: 'test-question-1',
            selectedOptionId: option.id,
            timeSpent: 15,
          }),
        });
      },
    });

    const updated = await prisma.practiceSession.findUnique({ where: { id: session.id } });
    expect(updated?.completedAt).not.toBeNull();
  });

  it('returns 403 when the session does not belong to the user', async () => {
    const user = await createTestUser({ id: 'prac-ans-u4', email: 'prac-ans4@example.com' });
    const other = await createTestUser({ id: 'prac-ans-u5', email: 'prac-ans5@example.com' });
    const session = await createTestPracticeSession(other.id);
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1' },
    });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            questionId: 'test-question-1',
            selectedOptionId: option.id,
          }),
        });
        expect(response.status).toBe(403);
      },
    });
  });

  it('returns 400 when required parameters are missing', async () => {
    const user = await createTestUser({ id: 'prac-ans-u6', email: 'prac-ans6@example.com' });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: 'test-question-1' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadAnswerRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: 'test-question-1', selectedOptionId: 'opt' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/practice/summary', () => {
  beforeEach(resetUserData);

  it('returns accuracy stats for a completed session', async () => {
    const user = await createTestUser({ id: 'prac-sum-u1', email: 'prac-sum@example.com' });
    const practiceSession = await createTestPracticeSession(user.id, ['test-question-1']);
    const correctOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: true },
    });
    await prisma.userAnswer.create({
      data: {
        userId: user.id,
        questionId: 'test-question-1',
        selectedOptionId: correctOption.id,
        practiceSessionId: practiceSession.id,
        isCorrect: true,
        timeSpent: 30,
      },
    });
    const appHandler = await loadSummaryRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      url: `/?sessionId=${practiceSession.id}`,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.total).toBe(1);
        expect(body.answered).toBe(1);
        expect(body.correct).toBe(1);
        expect(body.accuracy).toBe(100);
        expect(typeof body.timeSpent).toBe('number');
      },
    });
  });

  it('returns 400 when sessionId is missing', async () => {
    const user = await createTestUser({ id: 'prac-sum-u2', email: 'prac-sum2@example.com' });
    const appHandler = await loadSummaryRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 404 when the session does not belong to the user', async () => {
    const user = await createTestUser({ id: 'prac-sum-u3', email: 'prac-sum3@example.com' });
    const other = await createTestUser({ id: 'prac-sum-u4', email: 'prac-sum4@example.com' });
    const practiceSession = await createTestPracticeSession(other.id);
    const appHandler = await loadSummaryRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      url: `/?sessionId=${practiceSession.id}`,
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadSummaryRoute(null);

    await testApiHandler({
      appHandler,
      url: '/?sessionId=any-session-id',
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});
