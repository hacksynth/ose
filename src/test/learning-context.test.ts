import { beforeEach, describe, expect, it } from 'vitest';

import { buildLearningKnowledgeBase } from '@/lib/ai/learning-context';
import { invalidateLearning } from '@/lib/ai/context-cache';
import { prisma } from '@/lib/prisma';
import { createTestUser, resetUserData } from '@/test/helpers';

const TEST_USER_ID = 'learning-context-user';

describe('buildLearningKnowledgeBase', () => {
  beforeEach(async () => {
    invalidateLearning(TEST_USER_ID);
    await resetUserData();
  });

  it('includes today wrong choice details with selected and correct answers', async () => {
    const user = await createTestUser({
      id: TEST_USER_ID,
      email: 'learning-context@example.com',
    });
    const wrongOption = await prisma.questionOption.findUniqueOrThrow({
      where: { questionId_label: { questionId: 'test-question-1', label: 'B' } },
    });

    await prisma.userAnswer.create({
      data: {
        userId: user.id,
        questionId: 'test-question-1',
        selectedOptionId: wrongOption.id,
        isCorrect: false,
        timeSpent: 42,
      },
    });
    await prisma.wrongNote.create({
      data: {
        userId: user.id,
        questionId: 'test-question-1',
        note: 'confused the seeded distractor',
      },
    });

    const context = await buildLearningKnowledgeBase(user.id);

    expect(context).toContain('今日选择题作答明细');
    expect(context).toContain('今日错题明细');
    expect(context).toContain('[错]');
    expect(context).toContain('学生选择：B. Incorrect answer');
    expect(context).toContain('正确答案：A. Correct answer');
    expect(context).toContain('Which option is correct in the seeded API test question?');
    expect(context).toContain('不要要求学生再上传截图或题干');
  });
});
