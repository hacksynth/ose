import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { readAIImageFile } from '@/lib/ai/image-storage';
import { prisma } from '@/lib/prisma';

function mimeTypeForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const { id } = await params;
  const generation = await prisma.aIImageGeneration.findFirst({
    where: { id, userId: session.user.id, status: 'COMPLETED' },
    select: { imagePath: true, updatedAt: true },
  });
  if (!generation?.imagePath) return NextResponse.json({ message: '图片不存在' }, { status: 404 });

  try {
    const buffer = await readAIImageFile(generation.imagePath);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeTypeForPath(generation.imagePath),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Last-Modified': generation.updatedAt.toUTCString(),
      },
    });
  } catch {
    return NextResponse.json({ message: '图片文件不存在' }, { status: 404 });
  }
}
