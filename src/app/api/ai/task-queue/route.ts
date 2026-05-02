import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getWrongNoteImageQueueStats } from '@/lib/ai/wrong-note-image-queue';
import { imageUrlFor } from '@/lib/ai/image-url';
import { prisma } from '@/lib/prisma';
import { clampInt } from '@/lib/validate';

const TASK_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

function normalizeStatus(value: string | null): TaskStatus | null {
  return TASK_STATUSES.find((status) => status === value) ?? null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const status = normalizeStatus(searchParams.get('status'));
  const page = clampInt(searchParams.get('page'), 1, 10_000, 1);
  const pageSize = clampInt(searchParams.get('pageSize'), 10, 100, 30);
  const where = {
    userId,
    ...(status ? { status } : {}),
  };

  const [total, rows, counts] = await Promise.all([
    prisma.aIImageGeneration.count({ where }),
    prisma.aIImageGeneration.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        wrongNoteId: true,
        questionId: true,
        status: true,
        provider: true,
        model: true,
        promptProvider: true,
        promptModel: true,
        imageSize: true,
        imageQuality: true,
        imageOutputFormat: true,
        imageStyle: true,
        imagePath: true,
        sourceImagePath: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        question: {
          select: {
            content: true,
            knowledgePoint: {
              select: {
                name: true,
                parent: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.aIImageGeneration.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const queue = getWrongNoteImageQueueStats();
  const countByStatus = Object.fromEntries(TASK_STATUSES.map((item) => [item, 0]));
  for (const item of counts) countByStatus[item.status] = item._count._all;

  return NextResponse.json({
    queue,
    counts: countByStatus,
    items: rows.map((row) => ({
      id: row.id,
      kind: 'wrong-note-image',
      wrongNoteId: row.wrongNoteId,
      questionId: row.questionId,
      questionContent: row.question.content,
      knowledgePoint: row.question.knowledgePoint.parent
        ? `${row.question.knowledgePoint.parent.name} · ${row.question.knowledgePoint.name}`
        : row.question.knowledgePoint.name,
      status: row.status,
      processState: queue.runningIds.includes(row.id)
        ? 'RUNNING'
        : queue.queuedIds.includes(row.id)
          ? 'QUEUED'
          : null,
      provider: row.provider,
      model: row.model,
      promptProvider: row.promptProvider,
      promptModel: row.promptModel,
      imageSize: row.imageSize,
      imageQuality: row.imageQuality,
      imageOutputFormat: row.imageOutputFormat,
      imageStyle: row.imageStyle,
      sourceImagePath: row.sourceImagePath,
      imageUrl: row.status === 'COMPLETED' && row.imagePath ? imageUrlFor(row) : null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

  const result = await prisma.aIImageGeneration.deleteMany({
    where: {
      userId: session.user.id,
      status: 'FAILED',
    },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
