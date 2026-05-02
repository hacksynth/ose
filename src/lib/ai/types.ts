export type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface CompletionParams {
  systemPrompt: string;
  userMessage: string;
  messages?: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  imageUrls?: string[];
}

export interface AIProviderInfo {
  name: string;
  model: string;
  endpoint: string;
}

export type AIProviderKey = "claude" | "openai" | "gemini" | "custom";

export interface AIConfig {
  provider: AIProviderKey;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface AIProvider {
  name: string;
  getInfo(): AIProviderInfo;
  createCompletion(params: CompletionParams): Promise<string>;
  streamCompletion(params: CompletionParams): AsyncIterable<string>;
  supportsVision(): boolean;
}
