import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { resolveAIImageConfigFromRequest, listAIImageModels } from '@/lib/ai/image';
import { aiSettingsError } from '@/lib/ai/settings';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const config = await resolveAIImageConfigFromRequest(session.user.id, body);
    const models = await listAIImageModels(config);
    return NextResponse.json({ provider: config.provider, models });
  } catch (error) {
    return NextResponse.json({ message: aiSettingsError(error) }, { status: 400 });
  }
}
