import type { AIConfig, AIProvider, AIProviderKey } from "@/lib/ai/types";
import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createOpenAIProvider } from "@/lib/ai/providers/openai";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createCustomProvider } from "@/lib/ai/providers/custom";
import { prisma } from "@/lib/prisma";

function envConfigFor(provider: AIProviderKey): AIConfig | null {
  if (provider === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return { provider, apiKey, model: process.env.ANTHROPIC_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL };
  }
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return { provider, apiKey, model: process.env.OPENAI_MODEL, baseUrl: process.env.OPENAI_BASE_URL };
  }
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return { provider, apiKey, model: process.env.GEMINI_MODEL, baseUrl: process.env.GEMINI_BASE_URL };
  }
  if (provider === "custom") {
    const baseUrl = process.env.CUSTOM_BASE_URL;
    if (!baseUrl) return null;
    return { provider, apiKey: process.env.CUSTOM_API_KEY, model: process.env.CUSTOM_MODEL, baseUrl };
  }
  return null;
}

function resolveEnvConfig(): AIConfig | null {
  const preferred = process.env.AI_PROVIDER?.toLowerCase() as AIProviderKey | undefined;
  if (preferred) {
    const config = envConfigFor(preferred);
    if (config) return config;
  }
  for (const provider of ["claude", "openai", "gemini", "custom"] as AIProviderKey[]) {
    const config = envConfigFor(provider);
    if (config) return config;
  }
  return null;
}

function normalizeProvider(raw: string | null | undefined): AIProviderKey | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value === "claude" || value === "openai" || value === "gemini" || value === "custom") return value;
  return null;
}

export async function resolveAIConfig(userId?: string | null): Promise<AIConfig | null> {
  if (userId) {
    const settings = await prisma.userAISettings.findUnique({ where: { userId } });
    const provider = normalizeProvider(settings?.provider ?? null);
    if (provider) {
      const hasRequired = provider === "custom" ? Boolean(settings?.baseUrl) : Boolean(settings?.apiKey);
      if (hasRequired) {
        return {
          provider,
          apiKey: settings?.apiKey ?? undefined,
          model: settings?.model ?? undefined,
          baseUrl: settings?.baseUrl ?? undefined,
          visionSupport: settings?.visionSupport ?? null,
        };
      }
    }
  }
  return resolveEnvConfig();
}

export function buildAIProvider(config: AIConfig): AIProvider {
  if (config.provider === "claude") return createClaudeProvider(config);
  if (config.provider === "openai") return createOpenAIProvider(config);
  if (config.provider === "gemini") return createGeminiProvider(config);
  if (config.provider === "custom") return createCustomProvider(config);
  throw new Error(`不支持的 AI 供应商：${config.provider}`);
}

export async function getAIProvider(userId?: string | null): Promise<AIProvider> {
  const config = await resolveAIConfig(userId);
  if (!config) throw new Error("未配置 AI 供应商，请在个人中心填入 API Key 或设置环境变量");
  return buildAIProvider(config);
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
    const provider = buildAIProvider(config);
    const info = provider.getInfo();
    const source = await getConfigSource(userId);
    return {
      configured: true,
      provider: info.name,
      model: info.model,
      endpoint: info.endpoint,
      source,
    };
  } catch {
    return { configured: false, provider: null, model: null, endpoint: null, source: null };
  }
}

async function getConfigSource(userId?: string | null) {
  if (!userId) return "env" as const;
  const settings = await prisma.userAISettings.findUnique({ where: { userId } });
  if (!settings?.provider) return "env" as const;
  const hasRequired = settings.provider === "custom" ? Boolean(settings.baseUrl) : Boolean(settings.apiKey);
  return hasRequired ? ("user" as const) : ("env" as const);
}
