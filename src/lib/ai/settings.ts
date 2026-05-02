import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { buildAIProvider, resolveAIConfig } from "@/lib/ai";
import type { AIConfig, AIProviderKey } from "@/lib/ai/types";
import { normalizeErrorMessage } from "@/lib/ai/utils";
import { prisma } from "@/lib/prisma";

const DEFAULT_MODELS: Record<AIProviderKey, string> = {
  claude: "claude-sonnet-4-5-20250929",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  custom: "default",
};

const DEFAULT_BASE_URLS: Record<AIProviderKey, string | undefined> = {
  claude: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  gemini: undefined,
  custom: undefined,
};

function normalizeProvider(value: unknown): AIProviderKey | null {
  const provider = String(value ?? "").toLowerCase();
  if (provider === "claude" || provider === "openai" || provider === "gemini" || provider === "custom") return provider;
  return null;
}

function trimString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function resolveAIConfigFromRequest(userId: string, body: unknown): Promise<AIConfig> {
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const requestedProvider = normalizeProvider(data.provider);

  if (!requestedProvider) {
    const config = await resolveAIConfig(userId);
    if (!config) throw new Error("未找到可用的 AI 配置");
    return config;
  }

  const existing = await prisma.userAISettings.findUnique({ where: { userId } });
  const apiKeyDraft = trimString(data.apiKey, 500);
  const apiKey = apiKeyDraft || (existing?.provider === requestedProvider ? existing.apiKey ?? undefined : undefined);
  const model = trimString(data.model, 200) || undefined;
  const baseUrl = trimString(data.baseUrl, 500) || undefined;

  if (requestedProvider === "custom" && !baseUrl) {
    throw new Error("自定义供应商需要填写 Base URL");
  }

  if (requestedProvider !== "custom" && !apiKey) {
    throw new Error("请先填写或保存 API Key");
  }

  const visionSupport = "visionSupport" in data
    ? (data.visionSupport === true || data.visionSupport === false ? data.visionSupport : null)
    : null;

  return {
    provider: requestedProvider,
    apiKey: apiKey ?? undefined,
    model,
    baseUrl,
    visionSupport,
  };
}

export async function listAIModels(config: AIConfig) {
  if (config.provider === "openai") return listOpenAICompatibleModels(config, DEFAULT_BASE_URLS.openai);
  if (config.provider === "custom") return listOpenAICompatibleModels(config, config.baseUrl);
  if (config.provider === "claude") return listClaudeModels(config);
  if (config.provider === "gemini") return listGeminiModels(config);
  return [];
}

export async function testAIConfig(config: AIConfig) {
  const startedAt = Date.now();
  const provider = buildAIProvider({
    ...config,
    model: config.model || DEFAULT_MODELS[config.provider],
  });
  const content = await provider.createCompletion({
    systemPrompt: "You are a connectivity checker. Reply with exactly: OK",
    userMessage: "Reply with OK only.",
    maxTokens: 12,
    temperature: 0,
  });

  return {
    ok: true,
    provider: provider.name,
    model: provider.getInfo().model,
    latencyMs: Date.now() - startedAt,
    output: content.trim().slice(0, 120),
  };
}

// Minimal 1×1 transparent PNG encoded as a data URL for vision smoke tests.
const VISION_TEST_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export async function testVisionCapability(config: AIConfig): Promise<{ supportsVision: boolean; latencyMs: number }> {
  const startedAt = Date.now();
  const provider = buildAIProvider({
    ...config,
    model: config.model || DEFAULT_MODELS[config.provider],
    visionSupport: null,
  });
  try {
    await provider.createCompletion({
      systemPrompt: "You are a vision checker. If you can see images, reply with exactly: OK",
      userMessage: "Reply with OK only.",
      imageUrls: [VISION_TEST_IMAGE],
      maxTokens: 12,
      temperature: 0,
    });
    return { supportsVision: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { supportsVision: false, latencyMs: Date.now() - startedAt };
  }
}

async function listOpenAICompatibleModels(config: AIConfig, fallbackBaseUrl: string | undefined) {
  const baseUrl = (config.baseUrl || fallbackBaseUrl || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("请填写 Base URL");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(`${baseUrl}/models`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`模型列表获取失败：HTTP ${response.status}`);
  const data = await response.json() as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }>; };
  const rawModels = data.data ?? data.models ?? [];
  return uniqueSorted(rawModels.map((item) => item.id || item.name).filter(Boolean) as string[]);
}

async function listClaudeModels(config: AIConfig) {
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl || undefined });
  const models: string[] = [];
  for await (const model of client.models.list({ limit: 100 })) {
    models.push(model.id);
  }
  return uniqueSorted(models);
}

async function listGeminiModels(config: AIConfig) {
  if (!config.apiKey) throw new Error("请先填写 Gemini API Key");
  const client = new GoogleGenAI(config.baseUrl ? { apiKey: config.apiKey, httpOptions: { baseUrl: config.baseUrl } } : { apiKey: config.apiKey });
  const pager = await client.models.list({ config: { pageSize: 100 } });
  const models: string[] = [];

  for await (const model of pager) {
    const supportsGenerate = !model.supportedActions?.length || model.supportedActions.includes("generateContent");
    if (!supportsGenerate) continue;
    const name = model.name?.replace(/^models\//, "") || model.displayName;
    if (name) models.push(name);
  }

  return uniqueSorted(models);
}

function uniqueSorted(models: string[]) {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second));
}

export function aiSettingsError(error: unknown) {
  return normalizeErrorMessage(error) || "AI 操作失败";
}
