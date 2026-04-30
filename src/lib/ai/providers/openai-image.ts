import { createReadStream } from 'fs';
import path from 'path';
import OpenAI, { toFile } from 'openai';
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
} from 'openai/resources/images';

import type { AIImageConfig, AIImageProvider } from '@/lib/ai/image-types';
import { getSanitizedEndpoint } from '@/lib/ai/utils';

const defaultBaseUrl = 'https://api.openai.com/v1';
const defaultModel = 'gpt-image-2';

function mimeTypeFor(format: string) {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  return 'image/webp';
}

function mimeTypeForImagePath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function supportsInputFidelity(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized === 'gpt-image-1' || normalized === 'gpt-image-1.5';
}

async function bufferFromImageResult(image: { b64_json?: string; url?: string }, mimeType: string) {
  if (image.b64_json) return Buffer.from(image.b64_json, 'base64');
  if (!image.url) throw new Error('图片模型没有返回图片数据');

  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildGenerateRequest(
  model: string,
  params: Parameters<AIImageProvider['generateImage']>[0]
): ImageGenerateParamsNonStreaming {
  return {
    model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: params.quality,
    output_format: params.outputFormat,
    user: params.user,
  };
}

async function buildEditRequest(
  model: string,
  params: Parameters<AIImageProvider['generateImage']>[0]
): Promise<ImageEditParamsNonStreaming> {
  if (!params.referenceImagePath) throw new Error('缺少生图参考图');
  const request: ImageEditParamsNonStreaming = {
    model,
    image: await toFile(
      createReadStream(params.referenceImagePath),
      path.basename(params.referenceImagePath),
      {
        type: mimeTypeForImagePath(params.referenceImagePath),
      }
    ),
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: params.quality,
    output_format: params.outputFormat,
    user: params.user,
  };
  if (supportsInputFidelity(model)) request.input_fidelity = params.inputFidelity ?? 'high';
  return request;
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
      const response = params.referenceImagePath
        ? await getClient().images.edit(await buildEditRequest(model, params))
        : await getClient().images.generate(buildGenerateRequest(model, params));
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
      const response = params.referenceImagePath
        ? await getClient().images.edit(await buildEditRequest(model, params))
        : await getClient().images.generate(buildGenerateRequest(model, params));
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
