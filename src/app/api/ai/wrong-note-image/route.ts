import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
  enqueueWrongNoteImageGeneration,
  getWrongNoteImageQueueStats,
} from '@/lib/ai/wrong-note-image-queue';
import { createAIErrorResponse } from '@/lib/ai/utils';
import {
  getCurrentWrongNoteImageGeneration,
  prepareWrongNoteImageGeneration,
  serializeImageGeneration,
} from '@/lib/ai/wrong-note-image';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const wrongNoteId = String(searchParams.get('wrongNoteId') ?? '');
  if (!wrongNoteId) return NextResponse.json({ message: '参数不完整' }, { status: 400 });

  try {
    const generation = await getCurrentWrongNoteImageGeneration(userId, wrongNoteId);
    return NextResponse.json({
      configured: true,
      generation: generation ? serializeImageGeneration(generation) : null,
    });
  } catch (error) {
    return createAIErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const userId = session.user.id;
  const body = await request.json().catch(() => ({}));
  const wrongNoteId = String((body as { wrongNoteId?: unknown }).wrongNoteId ?? '');
  const force = Boolean((body as { force?: unknown }).force);
  if (!wrongNoteId) return NextResponse.json({ message: '参数不完整' }, { status: 400 });

  try {
    const result = await prepareWrongNoteImageGeneration({ userId, wrongNoteId, force });
    if (result.generation.status === 'PENDING')
      enqueueWrongNoteImageGeneration(result.generation.id);
    return NextResponse.json(
      {
        generation: serializeImageGeneration(result.generation),
        queued: result.queued,
        reused: result.reused,
        queue: getWrongNoteImageQueueStats(),
      },
      { status: result.created ? 202 : 200 }
    );
  } catch (error) {
    return createAIErrorResponse(error);
  }
}
