import { GoogleGenAI } from "@google/genai";
import type { AIConfig, AIProvider, CompletionParams } from "@/lib/ai/types";
import { fetchImageAsBase64, getSanitizedEndpoint } from "@/lib/ai/utils";

const defaultModel = "gemini-2.5-flash";
const defaultBaseUrl = "https://generativelanguage.googleapis.com";

async function buildContents(params: CompletionParams) {
  if (params.messages?.length) {
    return params.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  }
  if (!params.imageUrls?.length) return params.userMessage;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  for (const url of params.imageUrls) {
    const result = await fetchImageAsBase64(url);
    if (result) parts.push({ inlineData: { mimeType: result.mimeType, data: result.base64 } });
  }
  parts.push({ text: params.userMessage });
  return [{ role: "user", parts }];
}

export function createGeminiProvider(config: AIConfig): AIProvider {
  const apiKey = config.apiKey;
  const model = config.model || defaultModel;
  const baseUrl = config.baseUrl?.trim();

  function getClient() {
    if (!apiKey) throw new Error("未配置 Gemini API Key");
    return new GoogleGenAI(baseUrl ? { apiKey, httpOptions: { baseUrl } } : { apiKey });
  }

  return {
    name: "Gemini",
    supportsVision: () => true,
    getInfo() {
      return {
        name: "Gemini",
        model,
        endpoint: getSanitizedEndpoint(baseUrl, defaultBaseUrl),
      };
    },
    async createCompletion(params) {
      const response = await getClient().models.generateContent({
        model,
        contents: await buildContents(params),
        config: {
          systemInstruction: params.systemPrompt,
          maxOutputTokens: params.maxTokens ?? 1200,
          temperature: params.temperature ?? 0.3,
        },
      });
      return response.text ?? "";
    },
    async *streamCompletion(params) {
      const response = await getClient().models.generateContentStream({
        model,
        contents: await buildContents(params),
        config: {
          systemInstruction: params.systemPrompt,
          maxOutputTokens: params.maxTokens ?? 1200,
          temperature: params.temperature ?? 0.3,
        },
      });
      for await (const chunk of response) {
        if (chunk.text) yield chunk.text;
      }
    },
  };
}
