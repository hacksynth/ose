import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  normalizeImageOutputFormat,
  normalizeImageProvider,
  normalizeImageQuality,
  normalizeImageSize,
  normalizeImageStyle,
} from '@/lib/ai/image';
import {
  DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY,
  DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY,
  DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE,
} from '@/lib/ai/image-rate-limit';

const ALLOWED_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'custom']);

function maskApiKey(key: string | null | undefined) {
  if (!key) return null;
  if (key.length <= 6) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function trimString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function hasOwn(data: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function normalizeRateLimit(value: unknown, fallback: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const settings = await prisma.userAISettings.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({
    provider: settings?.provider ?? null,
    model: settings?.model ?? null,
    baseUrl: settings?.baseUrl ?? null,
    apiKeyMasked: maskApiKey(settings?.apiKey),
    hasApiKey: Boolean(settings?.apiKey),
    visionSupport: settings?.visionSupport ?? null,
    imageProvider: settings?.imageProvider ?? null,
    imageModel: settings?.imageModel ?? null,
    imageBaseUrl: settings?.imageBaseUrl ?? null,
    imageApiKeyMasked: maskApiKey(settings?.imageApiKey),
    hasImageApiKey: Boolean(settings?.imageApiKey),
    imageSize: settings?.imageSize ?? null,
    imageQuality: settings?.imageQuality ?? null,
    imageOutputFormat: settings?.imageOutputFormat ?? null,
    imageStyle: settings?.imageStyle ?? null,
    imageRateLimitPerMinute:
      settings?.imageRateLimitPerMinute ?? DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE,
    imageRateLimitHourly: settings?.imageRateLimitHourly ?? DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY,
    imageRateLimitDaily: settings?.imageRateLimitDaily ?? DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY,
    updatedAt: settings?.updatedAt ?? null,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await prisma.userAISettings.findUnique({ where: { userId: session.user.id } });

  const provider = hasOwn(body, 'provider')
    ? String(body.provider ?? '').toLowerCase()
    : (existing?.provider ?? '');
  if (provider && !ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ message: '不支持的 provider' }, { status: 400 });
  }
  const model = hasOwn(body, 'model') ? trimString(body.model, 200) : (existing?.model ?? '');
  const baseUrl = hasOwn(body, 'baseUrl')
    ? trimString(body.baseUrl, 500)
    : (existing?.baseUrl ?? '');
  const apiKeyRaw = typeof body.apiKey === 'string' ? body.apiKey : '';
  const clearApiKey = body.apiKey === null;

  if (provider === 'custom' && !baseUrl) {
    return NextResponse.json({ message: 'custom 供应商必须填写 Base URL' }, { status: 400 });
  }

  const providerChanged = provider !== (existing?.provider ?? '');
  const modelChanged = model !== (existing?.model ?? '');
  const nextVisionSupport = providerChanged || modelChanged ? null : (existing?.visionSupport ?? null);

  const nextApiKey = clearApiKey
    ? null
    : apiKeyRaw
      ? apiKeyRaw.trim().slice(0, 500)
      : (existing?.apiKey ?? null);
  const imageProvider = hasOwn(body, 'imageProvider')
    ? normalizeImageProvider(body.imageProvider)
    : normalizeImageProvider(existing?.imageProvider);
  if (hasOwn(body, 'imageProvider') && body.imageProvider && !imageProvider) {
    return NextResponse.json({ message: '不支持的生图 provider' }, { status: 400 });
  }
  const imageModel = hasOwn(body, 'imageModel')
    ? trimString(body.imageModel, 200)
    : (existing?.imageModel ?? '');
  const imageBaseUrl = hasOwn(body, 'imageBaseUrl')
    ? trimString(body.imageBaseUrl, 500)
    : (existing?.imageBaseUrl ?? '');
  const imageApiKeyRaw = typeof body.imageApiKey === 'string' ? body.imageApiKey : '';
  const clearImageApiKey = body.imageApiKey === null;
  const nextImageApiKey = clearImageApiKey
    ? null
    : imageApiKeyRaw
      ? imageApiKeyRaw.trim().slice(0, 500)
      : (existing?.imageApiKey ?? null);
  const imageSize = hasOwn(body, 'imageSize')
    ? normalizeImageSize(body.imageSize)
    : normalizeImageSize(existing?.imageSize);
  const imageQuality = hasOwn(body, 'imageQuality')
    ? normalizeImageQuality(body.imageQuality)
    : normalizeImageQuality(existing?.imageQuality);
  const imageOutputFormat = hasOwn(body, 'imageOutputFormat')
    ? normalizeImageOutputFormat(body.imageOutputFormat)
    : normalizeImageOutputFormat(existing?.imageOutputFormat);
  const imageStyle = hasOwn(body, 'imageStyle')
    ? normalizeImageStyle(body.imageStyle)
    : normalizeImageStyle(existing?.imageStyle);
  const imageRateLimitPerMinute = hasOwn(body, 'imageRateLimitPerMinute')
    ? normalizeRateLimit(body.imageRateLimitPerMinute, DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE, 1000)
    : (existing?.imageRateLimitPerMinute ?? DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE);
  const imageRateLimitHourly = hasOwn(body, 'imageRateLimitHourly')
    ? normalizeRateLimit(body.imageRateLimitHourly, DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY, 10_000)
    : (existing?.imageRateLimitHourly ?? DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY);
  const imageRateLimitDaily = hasOwn(body, 'imageRateLimitDaily')
    ? normalizeRateLimit(body.imageRateLimitDaily, DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY, 100_000)
    : (existing?.imageRateLimitDaily ?? DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY);

  if (imageProvider === 'custom' && !imageBaseUrl) {
    return NextResponse.json({ message: 'custom 生图供应商必须填写 Base URL' }, { status: 400 });
  }

  await prisma.userAISettings.upsert({
    where: { userId: session.user.id },
    update: {
      provider: provider || null,
      model: model || null,
      baseUrl: baseUrl || null,
      apiKey: nextApiKey,
      visionSupport: nextVisionSupport,
      imageProvider: imageProvider || null,
      imageModel: imageModel || null,
      imageBaseUrl: imageBaseUrl || null,
      imageApiKey: nextImageApiKey,
      imageSize,
      imageQuality,
      imageOutputFormat,
      imageStyle,
      imageRateLimitPerMinute,
      imageRateLimitHourly,
      imageRateLimitDaily,
    },
    create: {
      userId: session.user.id,
      provider: provider || null,
      model: model || null,
      baseUrl: baseUrl || null,
      apiKey: nextApiKey,
      visionSupport: nextVisionSupport,
      imageProvider: imageProvider || null,
      imageModel: imageModel || null,
      imageBaseUrl: imageBaseUrl || null,
      imageApiKey: nextImageApiKey,
      imageSize,
      imageQuality,
      imageOutputFormat,
      imageStyle,
      imageRateLimitPerMinute,
      imageRateLimitHourly,
      imageRateLimitDaily,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  await prisma.userAISettings.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
