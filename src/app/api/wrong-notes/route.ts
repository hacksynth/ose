import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clampInt } from '@/lib/validate';
import { getDescendantTopicIds } from '@/lib/knowledge-stats';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@/lib/constants';
import { imageUrlFor } from '@/lib/ai/image-url';

function getStatusFilter(status: string | null) {
  if (status === 'mastered') return { markedMastered: true };
  if (status === 'unmastered') return { markedMastered: false };
  return {};
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const page = clampInt(searchParams.get('page'), 1, 10_000, 1);
  const pageSize = clampInt(searchParams.get('pageSize'), 1, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT);
  const status = searchParams.get('status');
  const knowledgePointId = searchParams.get('knowledgePointId');
  const topicIds = knowledgePointId ? await getDescendantTopicIds(knowledgePointId) : undefined;

  const where = {
    userId,
    ...getStatusFilter(status),
    ...(topicIds ? { question: { knowledgePointId: { in: topicIds } } } : {}),
  };

  const [filteredTotal, total, unmastered, mastered, notes, topics] = await Promise.all([
    prisma.wrongNote.count({ where }),
    prisma.wrongNote.count({ where: { userId } }),
    prisma.wrongNote.count({ where: { userId, markedMastered: false } }),
    prisma.wrongNote.count({ where: { userId, markedMastered: true } }),
    prisma.wrongNote.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        note: true,
        markedMastered: true,
        createdAt: true,
        updatedAt: true,
        question: {
          select: {
            id: true,
            content: true,
            explanation: true,
            difficulty: true,
            questionNumber: true,
            year: true,
            session: true,
            knowledgePoint: {
              select: { id: true, name: true, parent: { select: { id: true, name: true } } },
            },
            options: {
              orderBy: { label: 'asc' },
              select: { id: true, label: true, content: true, isCorrect: true },
            },
            userAnswers: {
              where: { userId },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                isCorrect: true,
                selectedOptionId: true,
                createdAt: true,
                selectedOption: { select: { id: true, label: true, content: true } },
              },
            },
          },
        },
      },
    }),
    prisma.knowledgePoint.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  const wrongNoteIds = notes.map((note) => note.id);
  const [imageGenerations, explanationGenerations] = wrongNoteIds.length
    ? await Promise.all([
        prisma.aIImageGeneration.findMany({
          where: { userId, wrongNoteId: { in: wrongNoteIds } },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            wrongNoteId: true,
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
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
          },
        }),
        prisma.aIExplanationGeneration.findMany({
          where: { userId, wrongNoteId: { in: wrongNoteIds } },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            wrongNoteId: true,
            status: true,
            provider: true,
            model: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
          },
        }),
      ])
    : [[], []];

  const imageGenerationsByWrongNote = new Map<string, typeof imageGenerations>();
  for (const generation of imageGenerations) {
    if (!generation.wrongNoteId) continue;
    imageGenerationsByWrongNote.set(generation.wrongNoteId, [
      ...(imageGenerationsByWrongNote.get(generation.wrongNoteId) ?? []),
      generation,
    ]);
  }

  const explanationGenerationsByWrongNote = new Map<string, typeof explanationGenerations>();
  for (const generation of explanationGenerations) {
    if (!generation.wrongNoteId) continue;
    explanationGenerationsByWrongNote.set(generation.wrongNoteId, [
      ...(explanationGenerationsByWrongNote.get(generation.wrongNoteId) ?? []),
      generation,
    ]);
  }

  const items = notes.map((note) => {
    const wrongAnswers = note.question.userAnswers.filter((answer) => !answer.isCorrect);
    const latestWrong = wrongAnswers[0] ?? note.question.userAnswers[0];
    const correctOption = note.question.options.find((option) => option.isCorrect);
    const generations = imageGenerationsByWrongNote.get(note.id) ?? [];
    const imageGeneration =
      generations.find(
        (generation) => generation.status === 'PENDING' || generation.status === 'RUNNING'
      ) ??
      generations.find((generation) => generation.status === 'COMPLETED' && generation.imagePath) ??
      generations.find((generation) => generation.status === 'FAILED') ??
      null;

    const expGenerations = explanationGenerationsByWrongNote.get(note.id) ?? [];
    const explanationGeneration =
      expGenerations.find((g) => g.status === 'PENDING' || g.status === 'RUNNING') ??
      expGenerations.find((g) => g.status === 'COMPLETED') ??
      expGenerations.find((g) => g.status === 'FAILED') ??
      null;
    return {
      id: note.id,
      note: note.note,
      markedMastered: note.markedMastered,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      wrongCount: wrongAnswers.length,
      lastWrongAt: latestWrong?.createdAt ?? note.updatedAt,
      wrongOptionId: latestWrong?.selectedOptionId,
      wrongOption: latestWrong?.selectedOption,
      correctOption: correctOption
        ? { id: correctOption.id, label: correctOption.label, content: correctOption.content }
        : undefined,
      imageGeneration: imageGeneration
        ? {
            id: imageGeneration.id,
            status: imageGeneration.status,
            imageUrl:
              imageGeneration.status === 'COMPLETED' && imageGeneration.imagePath
                ? imageUrlFor(imageGeneration)
                : null,
            provider: imageGeneration.provider,
            model: imageGeneration.model,
            promptProvider: imageGeneration.promptProvider,
            promptModel: imageGeneration.promptModel,
            imageSize: imageGeneration.imageSize,
            imageQuality: imageGeneration.imageQuality,
            imageOutputFormat: imageGeneration.imageOutputFormat,
            imageStyle: imageGeneration.imageStyle,
            errorMessage: imageGeneration.errorMessage,
            createdAt: imageGeneration.createdAt,
            updatedAt: imageGeneration.updatedAt,
            completedAt: imageGeneration.completedAt,
          }
        : null,
      explanationGeneration: explanationGeneration
        ? {
            id: explanationGeneration.id,
            status: explanationGeneration.status,
            provider: explanationGeneration.provider,
            model: explanationGeneration.model,
            errorMessage: explanationGeneration.errorMessage,
            createdAt: explanationGeneration.createdAt,
            updatedAt: explanationGeneration.updatedAt,
            completedAt: explanationGeneration.completedAt,
          }
        : null,
      question: {
        id: note.question.id,
        content: note.question.content,
        explanation: note.question.explanation,
        difficulty: note.question.difficulty,
        questionNumber: note.question.questionNumber,
        year: note.question.year,
        session: note.question.session,
        knowledgePoint: note.question.knowledgePoint,
        options: note.question.options.map(({ isCorrect: _isCorrect, ...option }) => option),
      },
    };
  });

  return NextResponse.json({
    stats: { total, unmastered, mastered },
    topics,
    items,
    pagination: {
      page,
      pageSize,
      total: filteredTotal,
      totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)),
    },
  });
}
