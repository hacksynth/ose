import bcrypt from 'bcryptjs';
import { testApiHandler } from 'next-test-api-route-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { createTestUser, resetUserData, sessionFor } from '@/test/helpers';

async function loadProfileRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/profile/route');
}

async function loadPasswordRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/profile/password/route');
}

async function loadWrongNotesRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/wrong-notes/route');
}

async function loadWrongNoteDetailRoute(session: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ auth: async () => session }));
  return import('@/app/api/wrong-notes/[id]/route');
}

afterEach(() => {
  vi.doUnmock('@/lib/auth');
});

describe('PATCH /api/profile', () => {
  beforeEach(resetUserData);

  it('updates the display name', async () => {
    const user = await createTestUser({ id: 'profile-u1', email: 'profile@example.com' });
    const appHandler = await loadProfileRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Name' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.user.name).toBe('Updated Name');
      },
    });

    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved?.name).toBe('Updated Name');
  });

  it('updates the target exam date', async () => {
    const user = await createTestUser({ id: 'profile-u2', email: 'profile2@example.com' });
    const appHandler = await loadProfileRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetExamDate: '2026-11-01' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.user.targetExamDate).toBeDefined();
      },
    });
  });

  it('clears the target exam date when set to null', async () => {
    const user = await createTestUser({ id: 'profile-u3', email: 'profile3@example.com' });
    await prisma.user.update({
      where: { id: user.id },
      data: { targetExamDate: new Date('2026-11-01') },
    });
    const appHandler = await loadProfileRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetExamDate: null }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.user.targetExamDate).toBeNull();
      },
    });
  });

  it('returns 400 for an invalid exam date string', async () => {
    const user = await createTestUser({ id: 'profile-u4', email: 'profile4@example.com' });
    const appHandler = await loadProfileRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetExamDate: 'not-a-date' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 400 for an empty or whitespace-only name', async () => {
    const user = await createTestUser({ id: 'profile-u5', email: 'profile5@example.com' });
    const appHandler = await loadProfileRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '   ' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadProfileRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'New Name' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('PATCH /api/profile/password', () => {
  beforeEach(resetUserData);

  it('updates the password when the old password is correct', async () => {
    const plainPassword = 'old-password-123';
    const hashedPassword = bcrypt.hashSync(plainPassword, 1);
    const user = await prisma.user.create({
      data: {
        id: 'pw-u1',
        email: 'pw@example.com',
        name: 'PW User',
        password: hashedPassword,
      },
    });
    const appHandler = await loadPasswordRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldPassword: plainPassword, newPassword: 'new-secure-password' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ message: expect.any(String) });
      },
    });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    const valid = await bcrypt.compare('new-secure-password', updated!.password);
    expect(valid).toBe(true);
  });

  it('returns 400 when the old password is incorrect', async () => {
    const user = await createTestUser({ id: 'pw-u2', email: 'pw2@example.com' });
    const appHandler = await loadPasswordRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldPassword: 'wrong-password', newPassword: 'new-secure-password' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 400 when the new password is too short', async () => {
    const user = await createTestUser({ id: 'pw-u3', email: 'pw3@example.com' });
    const appHandler = await loadPasswordRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldPassword: 'any-old', newPassword: '123' }),
        });
        expect(response.status).toBe(400);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadPasswordRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldPassword: 'any', newPassword: 'new-password' }),
        });
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('GET /api/wrong-notes', () => {
  beforeEach(resetUserData);

  it('returns the user\'s wrong notes with question details', async () => {
    const user = await createTestUser({ id: 'wn-list-u1', email: 'wn-list@example.com' });
    const wrongOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: false },
    });
    await prisma.userAnswer.create({
      data: {
        userId: user.id,
        questionId: 'test-question-1',
        selectedOptionId: wrongOption.id,
        isCorrect: false,
        timeSpent: 10,
      },
    });
    await prisma.wrongNote.create({ data: { userId: user.id, questionId: 'test-question-1' } });
    const appHandler = await loadWrongNotesRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.items.length).toBe(1);
        expect(body.items[0].question.id).toBe('test-question-1');
        expect(body.stats.total).toBe(1);
        expect(body.stats.unmastered).toBe(1);
      },
    });
  });

  it('isolates wrong notes between users', async () => {
    const user = await createTestUser({ id: 'wn-list-u2', email: 'wn-list2@example.com' });
    const other = await createTestUser({ id: 'wn-list-u3', email: 'wn-list3@example.com' });
    const wrongOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: 'test-question-1', isCorrect: false },
    });
    await prisma.userAnswer.create({
      data: {
        userId: other.id,
        questionId: 'test-question-1',
        selectedOptionId: wrongOption.id,
        isCorrect: false,
        timeSpent: 10,
      },
    });
    await prisma.wrongNote.create({ data: { userId: other.id, questionId: 'test-question-1' } });
    const appHandler = await loadWrongNotesRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.items).toHaveLength(0);
        expect(body.stats.total).toBe(0);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadWrongNotesRoute(null);

    await testApiHandler({
      appHandler,
      async test({ fetch }) {
        const response = await fetch();
        expect(response.status).toBe(401);
      },
    });
  });
});

describe('PATCH /api/wrong-notes/[id]', () => {
  beforeEach(resetUserData);

  it('marks a wrong note as mastered', async () => {
    const user = await createTestUser({ id: 'wn-patch-u1', email: 'wn-patch@example.com' });
    const note = await prisma.wrongNote.create({
      data: { userId: user.id, questionId: 'test-question-1' },
    });
    const appHandler = await loadWrongNoteDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: note.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markedMastered: true }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.item.markedMastered).toBe(true);
      },
    });
  });

  it('updates the note text', async () => {
    const user = await createTestUser({ id: 'wn-patch-u2', email: 'wn-patch2@example.com' });
    const note = await prisma.wrongNote.create({
      data: { userId: user.id, questionId: 'test-question-1' },
    });
    const appHandler = await loadWrongNoteDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: note.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note: 'Remember: option A is correct due to X.' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.item.note).toBe('Remember: option A is correct due to X.');
      },
    });
  });

  it('returns 404 when trying to update another user\'s note', async () => {
    const user = await createTestUser({ id: 'wn-patch-u3', email: 'wn-patch3@example.com' });
    const other = await createTestUser({ id: 'wn-patch-u4', email: 'wn-patch4@example.com' });
    const note = await prisma.wrongNote.create({
      data: { userId: other.id, questionId: 'test-question-1' },
    });
    const appHandler = await loadWrongNoteDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: note.id },
      async test({ fetch }) {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markedMastered: true }),
        });
        expect(response.status).toBe(404);
      },
    });
  });
});

describe('DELETE /api/wrong-notes/[id]', () => {
  beforeEach(resetUserData);

  it('removes the wrong note from the database', async () => {
    const user = await createTestUser({ id: 'wn-del-u1', email: 'wn-del@example.com' });
    const note = await prisma.wrongNote.create({
      data: { userId: user.id, questionId: 'test-question-1' },
    });
    const appHandler = await loadWrongNoteDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: note.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'DELETE' });
        expect(response.status).toBe(200);
      },
    });

    const deleted = await prisma.wrongNote.findUnique({ where: { id: note.id } });
    expect(deleted).toBeNull();
  });

  it('returns 404 when trying to delete another user\'s note', async () => {
    const user = await createTestUser({ id: 'wn-del-u2', email: 'wn-del2@example.com' });
    const other = await createTestUser({ id: 'wn-del-u3', email: 'wn-del3@example.com' });
    const note = await prisma.wrongNote.create({
      data: { userId: other.id, questionId: 'test-question-1' },
    });
    const appHandler = await loadWrongNoteDetailRoute(sessionFor(user));

    await testApiHandler({
      appHandler,
      params: { id: note.id },
      async test({ fetch }) {
        const response = await fetch({ method: 'DELETE' });
        expect(response.status).toBe(404);
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const appHandler = await loadWrongNoteDetailRoute(null);

    await testApiHandler({
      appHandler,
      params: { id: 'any-note-id' },
      async test({ fetch }) {
        const response = await fetch({ method: 'DELETE' });
        expect(response.status).toBe(401);
      },
    });
  });
});
