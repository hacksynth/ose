import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/lib/auth';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@/lib/constants';
import { getDescendantTopicIds, visibilityFilter } from '@/lib/knowledge-stats';
import { prisma } from '@/lib/prisma';
import { questionSelect, stripCorrectFlags } from '@/lib/practice';
import { clampInt } from '@/lib/validate';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = clampInt(searchParams.get('page'), 1, 10_000, 1);
  const pageSize = clampInt(searchParams.get('pageSize'), 1, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT);
  const knowledgePointId = searchParams.get('knowledgePointId');
  const topicIds = knowledgePointId ? await getDescendantTopicIds(knowledgePointId) : undefined;

  const where: Prisma.QuestionWhereInput = {
    ...visibilityFilter(session.user.id),
    type: 'CHOICE',
    ...(topicIds ? { knowledgePointId: { in: topicIds } } : {}),
  };

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ year: 'desc' }, { session: 'asc' }, { questionNumber: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: questionSelect,
    }),
  ]);

  return NextResponse.json({
    items: questions.map(stripCorrectFlags),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
