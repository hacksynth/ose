import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { createTestUser, resetUserData, sessionFor } from '@/test/helpers';

async function loadPlanListRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/plan/route');
}

async function loadPlanDetailRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/plan/[id]/route');
}

async function loadPlanDayRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/plan/[id]/day/[dayNumber]/route');
}

function mockAIPlanGenerate(session: unknown, aiResponse: string) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  vi.doMock('@/lib/ai', () => ({
    isAIConfigured: async () => true,
    getAIProvider: async () => ({
      name: 'Mock',
      getInfo: () => ({ name: 'Mock', model: 'mock-model', endpoint: 'mock://ai' }),
      createCompletion: async () => aiResponse,
    }),
  }));
  vi.doMock('@/lib/ai/rate-limit', () => ({ checkAIRateLimit: () => true }));
  return import('@/app/api/plan/generate/route');
}

afterEach(() => {
  vi.doUnmock('@/lib/auth');
  vi.doUnmock('@/lib/ai');
  vi.doUnmock('@/lib/ai/rate-limit');
});

describe('POST /api/plan/generate', () => {
  beforeEach(resetUserData);

  it('generates a study plan from a valid JSON AI response', async () => {
    const user = await createTestUser({ id: 'plan-gen-u1', email: 'plan-gen@example.com' });
    const aiJson = JSON.stringify({
      overview: 'Test study plan overview',
      days: [{ dayNumber: 1, tasks: ['复习数据库', '完成练习题', '整理错题笔记'] }],
    });
    const appHandler = await mockAIPlanGenerate(sessionFor(user), aiJson);

    let planId!: string;

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: '2026-05-16', dailyTime: '2小时' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.planId).toBeDefined();
        expect(body.content).toBe('Test study plan overview');
        planId = body.planId as string;
      },
    });

    const saved = await prisma.studyPlan.findUnique({
      where: { id: planId },
      include: { days: true },
    });
    expect(saved).not.toBeNull();
    expect(saved!.userId).toBe(user.id);
    expect(saved!.days.length).toBeGreaterThan(0);
    expect(saved!.content).toBe('Test study plan overview');
  });

  it('falls back to markdown parsing when AI returns non-JSON', async () => {
    const user = await createTestUser({ id: 'plan-gen-u2', email: 'plan-gen2@example.com' });
    const markdownResponse =
      '- 复习数据库基础知识\n- 完成 15 道选择题\n- 整理薄弱知识点\n- 做模拟练习\n';
    const appHandler = await mockAIPlanGenerate(sessionFor(user), markdownResponse);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: '2026-05-16' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.planId).toBeDefined();
        const saved = await prisma.studyPlan.findUnique({
          where: { id: body.planId as string },
          include: { days: true },
        });
        expect(saved).not.toBeNull();
        expect(saved!.days.length).toBeGreaterThan(0);
      },
    });
  });

  it('returns 400 for a missing or invalid targetDate', async () => {
    const user = await createTestUser({ id: 'plan-gen-u3', email: 'plan-gen3@example.com' });
    const appHandler = await mockAIPlanGenerate(sessionFor(user), '{}');

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: 'not-a-date' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 429 when the AI rate limit is exceeded', async () => {
    const user = await createTestUser({ id: 'plan-gen-u4', email: 'plan-gen4@example.com' });

    vi.resetModules();
    vi.doMock('@/lib/auth', () => ({ auth: async () => sessionFor(user) }));
    vi.doMock('@/lib/ai', () => ({ isAIConfigured: async () => true }));
    vi.doMock('@/lib/ai/rate-limit', () => ({ checkAIRateLimit: () => false }));
    const appHandler = await import('@/app/api/plan/generate/route');

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: '2026-05-16' }),
        });
        expect(response.status).toBe(429);
      },
    });
  });

  it('returns 503 when AI is not configured', async () => {
    const user = await createTestUser({ id: 'plan-gen-u5', email: 'plan-gen5@example.com' });

    vi.resetModules();
    vi.doMock('@/lib/auth', () => ({ auth: async () => sessionFor(user) }));
    vi.doMock('@/lib/ai', () => ({ isAIConfigured: async () => false }));
    vi.doMock('@/lib/ai/rate-limit', () => ({ checkAIRateLimit: () => true }));
    const appHandler = await import('@/app/api/plan/generate/route');

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: '2026-05-16' }),
        });
        expect(response.status).toBe(503);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth', () => ({ auth: async () => null }));
    vi.doMock('@/lib/ai', () => ({ isAIConfigured: async () => false }));
    vi.doMock('@/lib/ai/rate-limit', () => ({ checkAIRateLimit: () => true }));
    const appHandler = await import('@/app/api/plan/generate/route');

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetDate: '2026-05-16' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/plan', () => {
  beforeEach(resetUserData);

  it('returns paginated study plans for the authenticated user', async () => {
    const user = await createTestUser({ id: 'plan-list-u1', email: 'plan-list@example.com' });
    await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: 'Test Plan',
        content: 'Overview',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 30,
        days: { create: [{ dayNumber: 1, date: new Date('2026-05-02'), tasks: ['Task 1'] }] },
      },
    });
    const appHandler = await loadPlanListRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.plans.length).toBe(1);
        expect(body.plans[0].title).toBe('Test Plan');
        expect(body.pagination).toMatchObject({ page: 1, total: 1 });
      },
    });
  });

  it('returns an empty list for a user with no plans', async () => {
    const user = await createTestUser({ id: 'plan-list-u2', email: 'plan-list2@example.com' });
    const appHandler = await loadPlanListRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.plans).toEqual([]);
        expect(body.pagination.total).toBe(0);
      },
    });
  });

  it('isolates plans between users', async () => {
    const user = await createTestUser({ id: 'plan-list-u3', email: 'plan-list3@example.com' });
    const other = await createTestUser({ id: 'plan-list-u4', email: 'plan-list4@example.com' });
    await prisma.studyPlan.create({
      data: {
        userId: other.id,
        title: "Other User's Plan",
        content: 'x',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
      },
    });
    const appHandler = await loadPlanListRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.plans).toHaveLength(0);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadPlanListRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/plan/[id]', () => {
  beforeEach(resetUserData);

  it('returns the plan with its days', async () => {
    const user = await createTestUser({ id: 'plan-det-u1', email: 'plan-det@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: 'My Detailed Plan',
        content: 'Overview',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
        days: { create: [{ dayNumber: 1, date: new Date('2026-05-02'), tasks: ['Study'] }] },
      },
    });
    const appHandler = await loadPlanDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id },
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.plan.id).toBe(plan.id);
        expect(body.plan.days.length).toBe(1);
      },
    });
  });

  it('returns 404 for another user\'s plan', async () => {
    const user = await createTestUser({ id: 'plan-det-u2', email: 'plan-det2@example.com' });
    const other = await createTestUser({ id: 'plan-det-u3', email: 'plan-det3@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: other.id,
        title: 'Other Plan',
        content: 'Overview',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
      },
    });
    const appHandler = await loadPlanDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id },
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(404);
      },
    });
  });
});

describe('PATCH /api/plan/[id]', () => {
  beforeEach(resetUserData);

  it('updates plan status to COMPLETED', async () => {
    const user = await createTestUser({ id: 'plan-patch-u1', email: 'plan-patch@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: 'Plan to Complete',
        content: 'Overview',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 5,
      },
    });
    const appHandler = await loadPlanDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.plan.status).toBe('COMPLETED');
      },
    });
  });

  it('returns 400 for an invalid status value', async () => {
    const user = await createTestUser({ id: 'plan-patch-u2', email: 'plan-patch2@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: 'Plan',
        content: 'x',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
      },
    });
    const appHandler = await loadPlanDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'INVALID_STATUS' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 404 when updating another user\'s plan', async () => {
    const user = await createTestUser({ id: 'plan-patch-u3', email: 'plan-patch3@example.com' });
    const other = await createTestUser({ id: 'plan-patch-u4', email: 'plan-patch4@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: other.id,
        title: 'Plan',
        content: 'x',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
      },
    });
    const appHandler = await loadPlanDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
        expect(response.status).toBe(404);
      },
    });
  });
});

describe('PATCH /api/plan/[id]/day/[dayNumber]', () => {
  beforeEach(resetUserData);

  it('marks a day as completed and saves notes', async () => {
    const user = await createTestUser({ id: 'plan-day-u1', email: 'plan-day@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: user.id,
        title: 'Daily Plan',
        content: 'Overview',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 2,
        days: {
          create: [
            { dayNumber: 1, date: new Date('2026-05-02'), tasks: ['Task 1'] },
            { dayNumber: 2, date: new Date('2026-05-03'), tasks: ['Task 2'] },
          ],
        },
      },
    });
    const appHandler = await loadPlanDayRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id, dayNumber: '1' },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: true, notes: 'Finished all tasks today.' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.day.completed).toBe(true);
        expect(body.day.notes).toBe('Finished all tasks today.');
      },
    });
  });

  it('returns 404 when the plan does not belong to the user', async () => {
    const user = await createTestUser({ id: 'plan-day-u2', email: 'plan-day2@example.com' });
    const other = await createTestUser({ id: 'plan-day-u3', email: 'plan-day3@example.com' });
    const plan = await prisma.studyPlan.create({
      data: {
        userId: other.id,
        title: 'Plan',
        content: 'x',
        targetExamDate: new Date('2026-06-01'),
        totalDays: 1,
        days: { create: [{ dayNumber: 1, date: new Date(), tasks: ['T'] }] },
      },
    });
    const appHandler = await loadPlanDayRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: plan.id, dayNumber: '1' },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        });
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadPlanDayRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'any-plan-id', dayNumber: '1' },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});
