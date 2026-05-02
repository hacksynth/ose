import type { AIConfig, AIProvider } from '@/lib/ai/types';
import { resolveAIConfig } from '@/lib/ai/config';
import { createClaudeProvider } from '@/lib/ai/providers/claude';
import { createCustomProvider } from '@/lib/ai/providers/custom';
import { createGeminiProvider } from '@/lib/ai/providers/gemini';
import { createOpenAIProvider } from '@/lib/ai/providers/openai';

export { getAIStatus, isAIConfigured, resolveAIConfig } from '@/lib/ai/config';

export function buildAIProvider(config: AIConfig): AIProvider {
  if (config.provider === 'claude') return createClaudeProvider(config);
  if (config.provider === 'openai') return createOpenAIProvider(config);
  if (config.provider === 'gemini') return createGeminiProvider(config);
  if (config.provider === 'custom') return createCustomProvider(config);
  throw new Error(`不支持的 AI 供应商：${config.provider}`);
}

export async function getAIProvider(userId?: string | null): Promise<AIProvider> {
  const config = await resolveAIConfig(userId);
  if (!config) {
    throw new Error('未配置 AI 供应商，请在个人中心填入 API Key 或设置环境变量');
  }
  return buildAIProvider(config);
}
