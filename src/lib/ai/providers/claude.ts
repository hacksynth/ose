import Anthropic from "@anthropic-ai/sdk";
import type { AIConfig, AIProvider, CompletionParams } from "@/lib/ai/types";
import { getSanitizedEndpoint } from "@/lib/ai/utils";

const defaultBaseUrl = "https://api.anthropic.com";
const defaultModel = "claude-sonnet-4-5-20250929";

function parseDataUrl(url: string): { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } | null {
  const match = url.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: match[2] };
}

function buildMessages(params: CompletionParams): Anthropic.MessageParam[] {
  if (params.messages?.length) {
    return params.messages.map((message) => ({ role: message.role, content: message.content }));
  }
  if (!params.imageUrls?.length) {
    return [{ role: "user", content: params.userMessage }];
  }
  const content: Anthropic.ContentBlockParam[] = params.imageUrls.map((url) => {
    const parsed = parseDataUrl(url);
    if (parsed) {
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: parsed.mediaType, data: parsed.data },
      };
    }
    return {
      type: "image" as const,
      source: { type: "url" as const, url },
    };
  });
  content.push({ type: "text", text: params.userMessage });
  return [{ role: "user", content }];
}

export function createClaudeProvider(config: AIConfig): AIProvider {
  const apiKey = config.apiKey;
  const model = config.model || defaultModel;
  const baseUrl = config.baseUrl;

  function getClient() {
    if (!apiKey) throw new Error("未配置 Claude API Key");
    return new Anthropic({ apiKey, baseURL: baseUrl || undefined });
  }

  return {
    name: "Claude",
    supportsVision: () => true,
    getInfo() {
      return {
        name: "Claude",
        model,
        endpoint: getSanitizedEndpoint(baseUrl, defaultBaseUrl),
      };
    },
    async createCompletion(params) {
      const response = await getClient().messages.create({
        model,
        max_tokens: params.maxTokens ?? 1200,
        temperature: params.temperature ?? 0.3,
        system: params.systemPrompt,
        messages: buildMessages(params),
      });
      return response.content
        .filter((block): block is Extract<Anthropic.ContentBlock, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("");
    },
    async *streamCompletion(params) {
      const stream = getClient().messages.stream({
        model,
        max_tokens: params.maxTokens ?? 1200,
        temperature: params.temperature ?? 0.3,
        system: params.systemPrompt,
        messages: buildMessages(params),
      });
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield event.delta.text;
          }
        }
      } finally {
        try {
          await stream.abort();
        } catch {
          // best-effort cleanup
        }
      }
    },
  };
}
