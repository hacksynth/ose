import type { AIConfig, AIProviderKey } from '@/lib/ai/types';
import { encryptSecret, isEncryptionEnabled, resolveSecret } from '@/lib/crypto/secrets';
import { prisma } from '@/lib/prisma';
import { getSanitizedEndpoint, resolveDefaultModel } from '@/lib/ai/utils';

const DEFAULT_BASE_URLS: Record<AIProviderKey, string | undefined> = {
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com',
  custom: undefined,
};

const PROVIDER_NAMES: Record<AIProviderKey, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  custom: 'Custom',
};

function envConfigFor(provider: AIProviderKey): AIConfig | null {
  if (provider === 'claude') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: process.env.ANTHROPIC_MODEL || resolveDefaultModel('claude'),
      baseUrl: process.env.ANTHROPIC_BASE_URL,
    };
  }
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: process.env.OPENAI_MODEL || resolveDefaultModel('openai'),
      baseUrl: process.env.OPENAI_BASE_URL,
    };
  }
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: process.env.GEMINI_MODEL || resolveDefaultModel('gemini'),
      baseUrl: process.env.GEMINI_BASE_URL,
    };
  }
  if (provider === 'custom') {
    const baseUrl = process.env.CUSTOM_BASE_URL;
    if (!baseUrl) return null;
    return {
      provider,
      apiKey: process.env.CUSTOM_API_KEY,
      model: process.env.CUSTOM_MODEL || resolveDefaultModel('custom'),
      baseUrl,
    };
  }
  return null;
}

function resolveEnvConfig(): AIConfig | null {
  const preferred = process.env.AI_PROVIDER?.toLowerCase() as AIProviderKey | undefined;
  if (preferred) {
    const config = envConfigFor(preferred);
    if (config) return config;
  }
  for (const provider of ['claude', 'openai', 'gemini', 'custom'] as AIProviderKey[]) {
    const config = envConfigFor(provider);
    if (config) return config;
  }
  return null;
}

function normalizeProvider(raw: string | null | undefined): AIProviderKey | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value === 'claude' || value === 'openai' || value === 'gemini' || value === 'custom') {
    return value;
  }
  return null;
}

function lazyMigrateApiKey(userId: string, plaintext: string): void {
  void (async () => {
    try {
      const encrypted = encryptSecret(plaintext);
      await prisma.userAISettings.update({
        where: { userId },
        data: { apiKeyEncrypted: encrypted, apiKey: null },
      });
    } catch {
      // Migration retries on next request.
    }
  })();
}

export async function resolveAIConfig(userId?: string | null): Promise<AIConfig | null> {
  if (userId) {
    const settings = await prisma.userAISettings.findUnique({ where: { userId } });
    const provider = normalizeProvider(settings?.provider ?? null);
    if (provider) {
      const apiKey = resolveSecret(settings?.apiKeyEncrypted, settings?.apiKey);
      const hasRequired = provider === 'custom' ? Boolean(settings?.baseUrl) : Boolean(apiKey);
      if (hasRequired) {
        if (settings && !settings.apiKeyEncrypted && settings.apiKey && isEncryptionEnabled()) {
          lazyMigrateApiKey(userId, settings.apiKey);
        }
        return {
          provider,
          apiKey: apiKey ?? undefined,
          model: settings?.model || resolveDefaultModel(provider),
          baseUrl: settings?.baseUrl ?? undefined,
          visionSupport: settings?.visionSupport ?? null,
        };
      }
    }
  }
  return resolveEnvConfig();
}

export async function isAIConfigured(userId?: string | null) {
  const config = await resolveAIConfig(userId);
  return config !== null;
}

export async function getAIStatus(userId?: string | null) {
  try {
    const config = await resolveAIConfig(userId);
    if (!config) {
      return { configured: false, provider: null, model: null, endpoint: null, source: null };
    }
    const fallbackEndpoint = DEFAULT_BASE_URLS[config.provider] ?? config.baseUrl ?? '';
    const source = await getConfigSource(userId);
    return {
      configured: true,
      provider: PROVIDER_NAMES[config.provider],
      model: config.model || resolveDefaultModel(config.provider),
      endpoint: getSanitizedEndpoint(config.baseUrl, fallbackEndpoint),
      source,
    };
  } catch {
    return { configured: false, provider: null, model: null, endpoint: null, source: null };
  }
}

async function getConfigSource(userId?: string | null) {
  if (!userId) return 'env' as const;
  const settings = await prisma.userAISettings.findUnique({ where: { userId } });
  if (!settings?.provider) return 'env' as const;
  const hasApiKey = Boolean(resolveSecret(settings.apiKeyEncrypted, settings.apiKey));
  const hasRequired = settings.provider === 'custom' ? Boolean(settings.baseUrl) : hasApiKey;
  return hasRequired ? ('user' as const) : ('env' as const);
}
