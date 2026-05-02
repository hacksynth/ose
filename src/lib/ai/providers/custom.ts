import OpenAI from "openai";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AIConfig, AIProvider, CompletionParams } from "@/lib/ai/types";
import { getSanitizedEndpoint, normalizeErrorMessage } from "@/lib/ai/utils";

const defaultModel = "default";

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

function shouldRetryWithoutMaxTokens(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase();
  return message.includes("max_tokens") || message.includes("max completion tokens") || message.includes("unknown parameter") || message.includes("unsupported parameter");
}

export function createCustomProvider(config: AIConfig): AIProvider {
  const baseUrl = config.baseUrl?.trim();
  const model = config.model?.trim() || defaultModel;
  const configuredKey = config.apiKey?.trim();

  function getClient() {
    if (!baseUrl) throw new Error("使用 custom 供应商时必须配置 Base URL");
    const apiKey = configuredKey || "noop";
    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: configuredKey ? undefined : { Authorization: "" },
    });
  }

  return {
    name: "Custom",
    supportsVision: () => true,
    getInfo() {
      if (!baseUrl) throw new Error("使用 custom 供应商时必须配置 Base URL");
      return {
        name: "Custom",
        model,
        endpoint: getSanitizedEndpoint(baseUrl, baseUrl),
      };
    },
    async createCompletion(params) {
      const request = {
        model,
        messages: buildMessages(params),
        temperature: params.temperature ?? 0.3,
      };

      try {
        const response = await getClient().chat.completions.create({
          ...request,
          max_tokens: params.maxTokens ?? 1200,
        });
        return response.choices[0]?.message.content ?? "";
      } catch (error) {
        if (!shouldRetryWithoutMaxTokens(error)) throw error;
        const response = await getClient().chat.completions.create(request);
        return response.choices[0]?.message.content ?? "";
      }
    },
    async *streamCompletion(params) {
      const request = {
        model,
        messages: buildMessages(params),
        temperature: params.temperature ?? 0.3,
        stream: true as const,
      };

      let stream;
      try {
        stream = await getClient().chat.completions.create({
          ...request,
          max_tokens: params.maxTokens ?? 1200,
        });
      } catch (error) {
        if (!shouldRetryWithoutMaxTokens(error)) throw error;
        stream = await getClient().chat.completions.create(request);
      }

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
