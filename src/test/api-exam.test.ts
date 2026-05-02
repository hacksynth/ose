import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { createTestExam, createTestUser, resetUserData, sessionFor } from '@/test/helpers';

async function loadGenerateRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/exam/generate/route');
}

async function loadStartRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/exam/[id]/start/route');
}

async function loadAnswerRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/exam/[id]/answer/route');
}

async function loadSubmitRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/exam/[id]/submit/route');
}

async function loadResultRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/exam/[id]/result/route');
}

afterEach(() => {
  vi.doUnmock('@/lib/auth');
});

describe('POST /api/exam/generate', () => {
  beforeEach(resetUserData);

  it('creates an AM mock exam with seeded choice questions', async () => {
    const user = await createTestUser({ id: 'exam-gen-u1', email: 'exam-gen@example.com' });
    const appHandler = await loadGenerateRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: 'AM' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.exam).toMatchObject({ session: 'AM', type: 'MOCK' });

        const saved = await prisma.exam.findUnique({ where: { id: body.exam.id } });
        expect(saved).not.toBeNull();
        expect(saved?.createdByUserId).toBe(user.id);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadGenerateRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: 'AM' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });

  it('returns 400 for an invalid session param', async () => {
    const user = await createTestUser({ id: 'exam-gen-u2', email: 'exam-gen2@example.com' });
    const appHandler = await loadGenerateRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: 'INVALID' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });
});

describe('POST /api/exam/[id]/start', () => {
  beforeEach(resetUserData);

  it('creates a new in-progress attempt', async () => {
    const user = await createTestUser({ id: 'exam-start-u1', email: 'exam-start@example.com' });
    const exam = await createTestExam(user.id);
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: exam.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.attemptId).toBeDefined();
        expect(body.resumed).toBeUndefined();

        const attempt = await prisma.examAttempt.findUnique({ where: { id: body.attemptId } });
        expect(attempt).toMatchObject({ userId: user.id, examId: exam.id, status: 'IN_PROGRESS' });
      },
    });
  });

  it('resumes an existing in-progress attempt instead of creating a new one', async () => {
    const user = await createTestUser({ id: 'exam-resume-u1', email: 'exam-resume@example.com' });
    const exam = await createTestExam(user.id);
    const existing = await prisma.examAttempt.create({ data: { userId: user.id, examId: exam.id } });
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: exam.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.attemptId).toBe(existing.id);
        expect(body.resumed).toBe(true);
      },
    });
  });

  it('returns 403 when the exam belongs to another user', async () => {
    const owner = await createTestUser({ id: 'exam-owner-u1', email: 'owner@example.com' });
    const attacker = await createTestUser({ id: 'exam-attacker-u1', email: 'attacker@example.com' });
    const exam = await createTestExam(owner.id);
    const appHandler = await loadStartRoute(sessionFor(attacker));

    await testApiHandler({
      appHandler,
      params: { id: exam.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });
        expect(response.status).toBe(403);
      },
    });
  });

  it('returns 404 for a non-existent exam', async () => {
    const user = await createTestUser({ id: 'exam-404-u1', email: 'exam404@example.com' });
    const appHandler = await loadStartRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: 'non-existent-exam-id' },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadStartRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'any-exam-id' },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('POST /api/exam/[id]/answer', () => {
  beforeEach(resetUserData);

  it('saves a choice answer and upserts on re-answer', async () => {
    const user = await createTestUser({ id: 'exam-ans-u1', email: 'exam-ans@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: user.id, examId: exam.id } });
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1' },
    });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: 'test-question-1', selectedOptionId: option.id }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ message: expect.any(String) });

        const saved = await prisma.examAnswer.findFirst({
          where: { examAttemptId: attempt.id, questionId: 'test-question-1' },
        });
        expect(saved?.selectedOptionId).toBe(option.id);
      },
    });
  });

  it('returns 404 when the attempt does not belong to the user', async () => {
    const user = await createTestUser({ id: 'exam-ans-u2', email: 'exam-ans2@example.com' });
    const other = await createTestUser({ id: 'exam-ans-u3', email: 'exam-ans3@example.com' });
    const exam = await createTestExam(other.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: other.id, examId: exam.id } });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: 'test-question-1', selectedOptionId: 'some-opt' }),
        });
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 400 when questionId is missing', async () => {
    const user = await createTestUser({ id: 'exam-ans-u4', email: 'exam-ans4@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: user.id, examId: exam.id } });
    const appHandler = await loadAnswerRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ selectedOptionId: 'some-option' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadAnswerRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'any-attempt-id' },
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

describe('POST /api/exam/[id]/submit', () => {
  beforeEach(resetUserData);

  it('marks attempt COMPLETED and creates wrong note for a wrong choice answer', async () => {
    const user = await createTestUser({ id: 'exam-sub-u1', email: 'exam-sub@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: user.id, examId: exam.id } });
    const wrongOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: false },
    });
    await prisma.examAnswer.create({
      data: {
        examAttemptId: attempt.id,
        questionId: 'test-question-1',
        selectedOptionId: wrongOption.id,
        isCorrect: false,
      },
    });
    const appHandler = await loadSubmitRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.totalScore).toBe(0);
        expect(body.choiceScore).toBe(0);
      },
    });

    const updated = await prisma.examAttempt.findUnique({ where: { id: attempt.id } });
    expect(updated?.status).toBe('COMPLETED');

    const wrongNote = await prisma.wrongNote.findFirst({
      where: { userId: user.id, questionId: 'test-question-1' },
    });
    expect(wrongNote).not.toBeNull();
  });

  it('gives full score for a correct answer and does not create a wrong note', async () => {
    const user = await createTestUser({ id: 'exam-sub-u2', email: 'exam-sub2@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: user.id, examId: exam.id } });
    const correctOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: true },
    });
    await prisma.examAnswer.create({
      data: {
        examAttemptId: attempt.id,
        questionId: 'test-question-1',
        selectedOptionId: correctOption.id,
        isCorrect: true,
      },
    });
    const appHandler = await loadSubmitRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.choiceScore).toBe(1);
        expect(body.totalScore).toBe(1);
      },
    });

    const wrongNote = await prisma.wrongNote.findFirst({
      where: { userId: user.id, questionId: 'test-question-1' },
    });
    expect(wrongNote).toBeNull();
  });

  it('returns 409 when the exam has already been submitted', async () => {
    const user = await createTestUser({ id: 'exam-sub-u3', email: 'exam-sub3@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: user.id,
        examId: exam.id,
        status: 'COMPLETED',
        finishedAt: new Date(),
        totalScore: 0,
      },
    });
    const appHandler = await loadSubmitRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });
        expect(response.status).toBe(409);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadSubmitRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'some-attempt-id' },
      async test({ fetch }) {
        const response = await fetch({ method: 'POST' });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/exam/[id]/result', () => {
  beforeEach(resetUserData);

  it('returns the completed attempt with exam details', async () => {
    const user = await createTestUser({ id: 'exam-res-u1', email: 'exam-res@example.com' });
    const exam = await createTestExam(user.id);
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: user.id,
        examId: exam.id,
        status: 'COMPLETED',
        finishedAt: new Date(),
        totalScore: 1,
        choiceScore: 1,
        caseScore: 0,
      },
    });
    const appHandler = await loadResultRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.attempt.id).toBe(attempt.id);
        expect(body.attempt.totalScore).toBe(1);
        expect(body.previousScore).toBeNull();
      },
    });
  });

  it('returns 404 when the attempt does not belong to the user', async () => {
    const user = await createTestUser({ id: 'exam-res-u2', email: 'exam-res2@example.com' });
    const other = await createTestUser({ id: 'exam-res-u3', email: 'exam-res3@example.com' });
    const exam = await createTestExam(other.id);
    const attempt = await prisma.examAttempt.create({ data: { userId: other.id, examId: exam.id } });
    const appHandler = await loadResultRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: attempt.id },
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadResultRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'some-attempt-id' },
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});
