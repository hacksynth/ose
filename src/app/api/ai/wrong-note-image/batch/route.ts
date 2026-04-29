import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
  enqueueWrongNoteImageGenerations,
  getWrongNoteImageQueueStats,
} from '@/lib/ai/wrong-note-image-queue';
import { getAIErrorDetails } from '@/lib/ai/utils';
import {
  getCurrentWrongNoteImageGeneration,
  prepareWrongNoteImageGeneration,
  serializeImageGeneration,
} from '@/lib/ai/wrong-note-image';

function batchLimit() {
  const value = Number.parseInt(process.env.AI_IMAGE_BATCH_MAX ?? '', 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 20;
}

function normalizeWrongNoteIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      rawValues
        .flatMap((item) => String(item ?? '').split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function validateIds(wrongNoteIds: string[]) {
  if (wrongNoteIds.length === 0) {
    return NextResponse.json({ message: '请选择要生成讲解图的错题' }, { status: 400 });
  }
  const limit = batchLimit();
  if (wrongNoteIds.length > limit) {
    return NextResponse.json(
      { message: `单次最多批量生成 ${limit} 道错题讲解图` },
      { status: 400 }
    );
  }
  return null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const wrongNoteIds = normalizeWrongNoteIds([
    ...searchParams.getAll('wrongNoteIds'),
    ...searchParams.getAll('wrongNoteId'),
    searchParams.get('ids'),
  ]);
  const invalid = validateIds(wrongNoteIds);
  if (invalid) return invalid;

  const items = await Promise.all(
    wrongNoteIds.map(async (wrongNoteId) => {
      try {
        const generation = await getCurrentWrongNoteImageGeneration(userId, wrongNoteId);
        return {
          wrongNoteId,
          generation: generation ? serializeImageGeneration(generation) : null,
        };
      } catch (error) {
        const details = getAIErrorDetails(error);
        return { wrongNoteId, generation: null, error: details.message, status: details.status };
      }
    })
  );

  return NextResponse.json({ items, queue: getWrongNoteImageQueueStats() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const userId = session.user.id;
  const body = await request.json().catch(() => ({}));
  const wrongNoteIds = normalizeWrongNoteIds((body as { wrongNoteIds?: unknown }).wrongNoteIds);
  const force = Boolean((body as { force?: unknown }).force);
  const invalid = validateIds(wrongNoteIds);
  if (invalid) return invalid;

  const generationIdsToQueue: string[] = [];
  const items = [];

  for (const wrongNoteId of wrongNoteIds) {
    try {
      const result = await prepareWrongNoteImageGeneration({ userId, wrongNoteId, force });
      if (result.generation.status === 'PENDING') generationIdsToQueue.push(result.generation.id);
      items.push({
        wrongNoteId,
        generation: serializeImageGeneration(result.generation),
        queued: result.queued,
        reused: result.reused,
        created: result.created,
      });
    } catch (error) {
      const details = getAIErrorDetails(error);
      items.push({ wrongNoteId, generation: null, error: details.message, status: details.status });
    }
  }

  enqueueWrongNoteImageGenerations(generationIdsToQueue);

  return NextResponse.json(
    { items, queue: getWrongNoteImageQueueStats() },
    { status: generationIdsToQueue.length > 0 ? 202 : 200 }
  );
}
