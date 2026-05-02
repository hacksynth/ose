import OpenAI from "openai";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AIConfig, AIProvider, CompletionParams } from "@/lib/ai/types";
import { getSanitizedEndpoint } from "@/lib/ai/utils";

const defaultBaseUrl = "https://api.openai.com/v1";
const defaultModel = "gpt-4o-mini";

function isVisionCapableModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("gpt-4o")) return true;
  if (m.includes("gpt-4-turbo")) return true;
  if (m.includes("gpt-4-vision")) return true;
  if (m.includes("gpt-4.5")) return true;
  if (m.includes("gpt-4.1")) return true;
  if (/^gpt-5/.test(m)) return true;
  if (/\bo[134][-\s]/.test(m) || m === "o1" || m === "o3" || m === "o4") return true;
  if (m.includes("o4-mini")) return true;
  return false;
}

function buildMessages(params: CompletionParams): ChatCompletionMessageParam[] {
  if (params.messages?.length) {
    return [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map((message) => ({ role: message.role, content: message.content }) as ChatCompletionMessageParam),
    ];
  }
  if (!params.imageUrls?.length) {
    return [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ];
  }
  const parts: ChatCompletionContentPart[] = params.imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
  parts.push({ type: "text", text: params.userMessage });
  return [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: parts },
  ];
}

export function createOpenAIProvider(config: AIConfig): AIProvider {
  const apiKey = config.apiKey;
  const model = config.model || defaultModel;
  const baseUrl = config.baseUrl;

  function getClient() {
    if (!apiKey) throw new Error("未配置 OpenAI API Key");
    return new OpenAI({ apiKey, baseURL: baseUrl || undefined });
  }

  return {
    name: "OpenAI",
    supportsVision: () => config.visionSupport ?? isVisionCapableModel(model),
    getInfo() {
      return {
        name: "OpenAI",
        model,
        endpoint: getSanitizedEndpoint(baseUrl, defaultBaseUrl),
      };
    },
    async createCompletion(params) {
      const response = await getClient().chat.completions.create({
        model,
        max_tokens: params.maxTokens ?? 1200,
        temperature: params.temperature ?? 0.3,
        messages: buildMessages(params),
      });
      return response.choices[0]?.message.content ?? "";
    },
    async *streamCompletion(params) {
      const stream = await getClient().chat.completions.create({
        model,
        max_tokens: params.maxTokens ?? 1200,
        temperature: params.temperature ?? 0.3,
        messages: buildMessages(params),
        stream: true,
      });
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta.content;
          if (text) yield text;
        }
      } finally {
        try {
          stream.controller?.abort?.();
        } catch {
          // ignore
        }
      }
    },
  };
}
