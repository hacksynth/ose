export type AIImageProviderKey = 'openai' | 'custom';

export type AIImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type AIImageQuality = 'low' | 'medium' | 'high';
export type AIImageOutputFormat = 'webp' | 'png' | 'jpeg';
export type AIImageStyle = 'clean_education_card' | 'hand_drawn' | 'flowchart';

export interface AIImageConfig {
  provider: AIImageProviderKey;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  size: AIImageSize;
  quality: AIImageQuality;
  outputFormat: AIImageOutputFormat;
  style: AIImageStyle;
}

export interface AIImageProviderInfo {
  name: string;
  model: string;
  endpoint: string;
}

export interface ImageGenerationParams {
  prompt: string;
  size: AIImageSize;
  quality: AIImageQuality;
  outputFormat: AIImageOutputFormat;
  user?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  revisedPrompt?: string;
}

export interface AIImageProvider {
  name: string;
  getInfo(): AIImageProviderInfo;
  generateImage(params: ImageGenerationParams): Promise<GeneratedImage>;
}

export const AI_IMAGE_PROVIDER_OPTIONS: Array<{ value: AIImageProviderKey; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: '自定义（OpenAI 兼容）' },
];

export const AI_IMAGE_SIZE_OPTIONS: Array<{ value: AIImageSize; label: string }> = [
  { value: '1024x1536', label: '竖版 1024x1536' },
  { value: '1024x1024', label: '方版 1024x1024' },
  { value: '1536x1024', label: '横版 1536x1024' },
];

export const AI_IMAGE_QUALITY_OPTIONS: Array<{ value: AIImageQuality; label: string }> = [
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

export const AI_IMAGE_OUTPUT_FORMAT_OPTIONS: Array<{ value: AIImageOutputFormat; label: string }> =
  [
    { value: 'webp', label: 'WebP' },
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
  ];

export const AI_IMAGE_STYLE_OPTIONS: Array<{ value: AIImageStyle; label: string }> = [
  { value: 'clean_education_card', label: '清爽复盘卡' },
  { value: 'flowchart', label: '流程图风格' },
  { value: 'hand_drawn', label: '手绘草图风格' },
];
