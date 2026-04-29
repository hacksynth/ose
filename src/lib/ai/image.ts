import {
  createCustomImageProvider,
  createOpenAIImageProvider,
} from '@/lib/ai/providers/openai-image';
import type {
  AIImageConfig,
  AIImageOutputFormat,
  AIImageProvider,
  AIImageProviderKey,
  AIImageQuality,
  AIImageSize,
  AIImageStyle,
} from '@/lib/ai/image-types';
import { prisma } from '@/lib/prisma';

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_IMAGE_SIZE: AIImageSize = '1024x1536';
export const DEFAULT_IMAGE_QUALITY: AIImageQuality = 'medium';
export const DEFAULT_IMAGE_OUTPUT_FORMAT: AIImageOutputFormat = 'webp';
export const DEFAULT_IMAGE_STYLE: AIImageStyle = 'clean_education_card';

const IMAGE_PROVIDERS = new Set(['openai', 'custom']);
const IMAGE_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
const IMAGE_QUALITIES = new Set(['low', 'medium', 'high']);
const IMAGE_OUTPUT_FORMATS = new Set(['webp', 'png', 'jpeg']);
const IMAGE_STYLES = new Set(['clean_education_card', 'hand_drawn', 'flowchart']);

function trimString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeImageProvider(raw: unknown): AIImageProviderKey | null {
  const value = String(raw ?? '').toLowerCase();
  return IMAGE_PROVIDERS.has(value) ? (value as AIImageProviderKey) : null;
}

export function normalizeImageSize(raw: unknown): AIImageSize {
  const value = String(raw ?? '');
  return IMAGE_SIZES.has(value) ? (value as AIImageSize) : DEFAULT_IMAGE_SIZE;
}

export function normalizeImageQuality(raw: unknown): AIImageQuality {
  const value = String(raw ?? '').toLowerCase();
  return IMAGE_QUALITIES.has(value) ? (value as AIImageQuality) : DEFAULT_IMAGE_QUALITY;
}

export function normalizeImageOutputFormat(raw: unknown): AIImageOutputFormat {
  const value = String(raw ?? '').toLowerCase();
  return IMAGE_OUTPUT_FORMATS.has(value)
    ? (value as AIImageOutputFormat)
    : DEFAULT_IMAGE_OUTPUT_FORMAT;
}

export function normalizeImageStyle(raw: unknown): AIImageStyle {
  const value = String(raw ?? '').toLowerCase();
  return IMAGE_STYLES.has(value) ? (value as AIImageStyle) : DEFAULT_IMAGE_STYLE;
}

function imageDefaults(config?: Partial<AIImageConfig> | null) {
  return {
    size: normalizeImageSize(config?.size ?? process.env.AI_IMAGE_SIZE),
    quality: normalizeImageQuality(config?.quality ?? process.env.AI_IMAGE_QUALITY),
    outputFormat: normalizeImageOutputFormat(
      config?.outputFormat ?? process.env.AI_IMAGE_OUTPUT_FORMAT
    ),
    style: normalizeImageStyle(config?.style ?? process.env.AI_IMAGE_STYLE),
  };
}

function envConfigFor(provider: AIImageProviderKey): AIImageConfig | null {
  const defaults = imageDefaults();
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_IMAGE_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      baseUrl: process.env.OPENAI_IMAGE_BASE_URL,
      ...defaults,
    };
  }
  if (provider === 'custom') {
    const baseUrl = process.env.CUSTOM_IMAGE_BASE_URL;
    if (!baseUrl) return null;
    return {
      provider,
      apiKey: process.env.CUSTOM_IMAGE_API_KEY,
      model: process.env.CUSTOM_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      baseUrl,
      ...defaults,
    };
  }
  return null;
}

function resolveEnvImageConfig(): AIImageConfig | null {
  const preferred = normalizeImageProvider(process.env.AI_IMAGE_PROVIDER);
  if (preferred) {
    const config = envConfigFor(preferred);
    if (config) return config;
  }
  for (const provider of ['openai', 'custom'] as AIImageProviderKey[]) {
    const config = envConfigFor(provider);
    if (config) return config;
  }
  return null;
}

export async function resolveAIImageConfig(userId?: string | null): Promise<AIImageConfig | null> {
  if (userId) {
    const settings = await prisma.userAISettings.findUnique({ where: { userId } });
    const provider = normalizeImageProvider(settings?.imageProvider);
    if (provider) {
      const hasRequired =
        provider === 'custom' ? Boolean(settings?.imageBaseUrl) : Boolean(settings?.imageApiKey);
      if (hasRequired) {
        return {
          provider,
          apiKey: settings?.imageApiKey ?? undefined,
          model: settings?.imageModel ?? DEFAULT_IMAGE_MODEL,
          baseUrl: settings?.imageBaseUrl ?? undefined,
          size: normalizeImageSize(settings?.imageSize),
          quality: normalizeImageQuality(settings?.imageQuality),
          outputFormat: normalizeImageOutputFormat(settings?.imageOutputFormat),
          style: normalizeImageStyle(settings?.imageStyle),
        };
      }
    }
  }
  return resolveEnvImageConfig();
}

export async function resolveAIImageConfigFromRequest(
  userId: string,
  body: unknown
): Promise<AIImageConfig> {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const requestedProvider = normalizeImageProvider(data.imageProvider);

  if (!requestedProvider) {
    const config = await resolveAIImageConfig(userId);
    if (!config) throw new Error('未找到可用的生图配置');
    return config;
  }

  const existing = await prisma.userAISettings.findUnique({ where: { userId } });
  const imageApiKeyDraft = trimString(data.imageApiKey, 500);
  const apiKey =
    imageApiKeyDraft ||
    (existing?.imageProvider === requestedProvider
      ? (existing.imageApiKey ?? undefined)
      : undefined);
  const model = trimString(data.imageModel, 200) || undefined;
  const baseUrl = trimString(data.imageBaseUrl, 500) || undefined;

  if (requestedProvider === 'custom' && !baseUrl) {
    throw new Error('自定义生图供应商需要填写 Base URL');
  }

  if (requestedProvider !== 'custom' && !apiKey) {
    throw new Error('请先填写或保存生图 API Key');
  }

  return {
    provider: requestedProvider,
    apiKey,
    model,
    baseUrl,
    size: normalizeImageSize(data.imageSize),
    quality: normalizeImageQuality(data.imageQuality),
    outputFormat: normalizeImageOutputFormat(data.imageOutputFormat),
    style: normalizeImageStyle(data.imageStyle),
  };
}

export async function listAIImageModels(config: AIImageConfig) {
  const baseUrl =
    config.provider === 'openai'
      ? (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      : (config.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('请填写生图 Base URL');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(`${baseUrl}/models`, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`生图模型列表获取失败：HTTP ${response.status}`);
  const data = (await response.json()) as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<{ id?: string; name?: string }>;
  };
  const rawModels = data.data ?? data.models ?? [];
  const models = rawModels.map((item) => item.id || item.name).filter(Boolean) as string[];
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second)
  );
}

export function buildAIImageProvider(config: AIImageConfig): AIImageProvider {
  if (config.provider === 'openai') return createOpenAIImageProvider(config);
  if (config.provider === 'custom') return createCustomImageProvider(config);
  throw new Error(`不支持的生图供应商：${config.provider}`);
}

export async function getAIImageProvider(userId?: string | null): Promise<AIImageProvider> {
  const config = await resolveAIImageConfig(userId);
  if (!config) throw new Error('未配置生图供应商，请在个人中心填入生图 API Key 或设置环境变量');
  return buildAIImageProvider(config);
}

export async function isAIImageConfigured(userId?: string | null) {
  const config = await resolveAIImageConfig(userId);
  return config !== null;
}

export async function getAIImageStatus(userId?: string | null) {
  try {
    const config = await resolveAIImageConfig(userId);
    if (!config) {
      return { configured: false, provider: null, model: null, endpoint: null, source: null };
    }
    const provider = buildAIImageProvider(config);
    const info = provider.getInfo();
    const source = await getImageConfigSource(userId);
    return {
      configured: true,
      provider: info.name,
      model: info.model,
      endpoint: info.endpoint,
      source,
      size: config.size,
      quality: config.quality,
      outputFormat: config.outputFormat,
      style: config.style,
    };
  } catch {
    return { configured: false, provider: null, model: null, endpoint: null, source: null };
  }
}

async function getImageConfigSource(userId?: string | null) {
  if (!userId) return 'env' as const;
  const settings = await prisma.userAISettings.findUnique({ where: { userId } });
  const provider = normalizeImageProvider(settings?.imageProvider);
  if (!provider) return 'env' as const;
  const hasRequired =
    provider === 'custom' ? Boolean(settings?.imageBaseUrl) : Boolean(settings?.imageApiKey);
  return hasRequired ? ('user' as const) : ('env' as const);
}
