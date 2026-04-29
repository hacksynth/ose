import OpenAI from 'openai';
import type { ImageGenerateParamsNonStreaming } from 'openai/resources/images';

import type { AIImageConfig, AIImageProvider } from '@/lib/ai/image-types';
import { getSanitizedEndpoint } from '@/lib/ai/utils';

const defaultBaseUrl = 'https://api.openai.com/v1';
const defaultModel = 'gpt-image-2';

function mimeTypeFor(format: string) {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  return 'image/webp';
}

async function bufferFromImageResult(image: { b64_json?: string; url?: string }, mimeType: string) {
  if (image.b64_json) return Buffer.from(image.b64_json, 'base64');
  if (!image.url) throw new Error('图片模型没有返回图片数据');

  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function createOpenAIImageProvider(config: AIImageConfig): AIImageProvider {
  const apiKey = config.apiKey?.trim();
  const model = config.model?.trim() || defaultModel;
  const baseUrl = config.baseUrl?.trim();

  function getClient() {
    if (!apiKey) throw new Error('未配置 OpenAI 生图 API Key');
    return new OpenAI({ apiKey, baseURL: baseUrl || undefined });
  }

  return {
    name: 'OpenAI',
    getInfo() {
      return {
        name: 'OpenAI',
        model,
        endpoint: getSanitizedEndpoint(baseUrl, defaultBaseUrl),
      };
    },
    async generateImage(params) {
      const mimeType = mimeTypeFor(params.outputFormat);
      const request: ImageGenerateParamsNonStreaming = {
        model,
        prompt: params.prompt,
        n: 1,
        size: params.size,
        quality: params.quality,
        output_format: params.outputFormat,
        user: params.user,
      };
      const response = await getClient().images.generate(request);
      const image = response.data?.[0];
      if (!image) throw new Error('图片模型没有返回结果');
      return {
        buffer: await bufferFromImageResult(image, mimeType),
        mimeType,
        revisedPrompt: image.revised_prompt,
      };
    },
  };
}

export function createCustomImageProvider(config: AIImageConfig): AIImageProvider {
  const baseUrl = config.baseUrl?.trim();
  const configuredKey = config.apiKey?.trim();
  const model = config.model?.trim() || defaultModel;

  function getClient() {
    if (!baseUrl) throw new Error('使用 custom 生图供应商时必须配置 Base URL');
    const apiKey = configuredKey || 'noop';
    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: configuredKey ? undefined : { Authorization: '' },
    });
  }

  return {
    name: 'Custom',
    getInfo() {
      if (!baseUrl) throw new Error('使用 custom 生图供应商时必须配置 Base URL');
      return {
        name: 'Custom',
        model,
        endpoint: getSanitizedEndpoint(baseUrl, baseUrl),
      };
    },
    async generateImage(params) {
      const mimeType = mimeTypeFor(params.outputFormat);
      const request: ImageGenerateParamsNonStreaming = {
        model,
        prompt: params.prompt,
        n: 1,
        size: params.size,
        quality: params.quality,
        output_format: params.outputFormat,
        user: params.user,
      };
      const response = await getClient().images.generate(request);
      const image = response.data?.[0];
      if (!image) throw new Error('图片模型没有返回结果');
      return {
        buffer: await bufferFromImageResult(image, mimeType),
        mimeType,
        revisedPrompt: image.revised_prompt,
      };
    },
  };
}
