import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { resolveAIImageConfigFromRequest, listAIImageModels } from '@/lib/ai/image';
import { aiSettingsError } from '@/lib/ai/settings';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const startedAt = Date.now();
    const config = await resolveAIImageConfigFromRequest(session.user.id, body);
    const models = await listAIImageModels(config);
    const model = config.model || 'gpt-image-2';
    const includesModel = models.includes(model);

    return NextResponse.json({
      ok: true,
      provider: config.provider === 'openai' ? 'OpenAI' : 'Custom',
      model,
      latencyMs: Date.now() - startedAt,
      output: models.length
        ? includesModel
          ? `模型列表可访问，已找到 ${model}`
          : `模型列表可访问，共 ${models.length} 个模型`
        : '接口可访问，但没有返回模型列表',
    });
  } catch (error) {
    return NextResponse.json({ message: aiSettingsError(error) }, { status: 400 });
  }
}
