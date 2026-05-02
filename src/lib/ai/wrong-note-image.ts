import crypto from 'crypto';
import type { Prisma } from '@prisma/client';

import { buildAIProvider, resolveAIConfig } from '@/lib/ai';
import {
  buildAIImageProvider,
  normalizeImageOutputFormat,
  normalizeImageQuality,
  normalizeImageSize,
  normalizeImageStyle,
  resolveAIImageConfig,
} from '@/lib/ai/image';
import { parseAIJson } from '@/lib/ai/json';
import { extensionForMimeType, writeAIImageFile } from '@/lib/ai/image-storage';
import { checkAIImageRateLimit } from '@/lib/ai/image-rate-limit';
import { checkAIRateLimit } from '@/lib/ai/rate-limit';
import {
  buildWrongNoteImagePromptUserMessage,
  WRONG_NOTE_IMAGE_PROMPT_SYSTEM_PROMPT,
} from '@/lib/ai/prompts';
import {
  getWrongNoteImageStyleAnchor,
  type WrongNoteImageStyleAnchor,
} from '@/lib/ai/wrong-note-image-style-anchors';
import { extractImageUrls, normalizeErrorMessage } from '@/lib/ai/utils';
import { prisma } from '@/lib/prisma';
import { imageUrlFor } from '@/lib/ai/image-url';

export const WRONG_NOTE_IMAGE_TEMPLATE_VERSION = '2026-05-02-v6-vision-support';

type WrongNoteImagePromptResponse = {
  imagePrompt?: string;
};

type SerializedGeneration = {
  id: string;
  status: string;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  provider: string;
  model: string;
  promptProvider: string;
  promptModel: string;
  imageSize: string;
  imageQuality: string;
  imageOutputFormat: string;
  imageStyle: string;
  errorMessage: string | null;
};

type GenerationForSerialization = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  provider: string;
  model: string;
  promptProvider: string;
  promptModel: string;
  imageSize: string;
  imageQuality: string;
  imageOutputFormat: string;
  imageStyle: string;
  imagePath: string | null;
  errorMessage: string | null;
};

export { imageUrlFor };

export function serializeImageGeneration(
  generation: GenerationForSerialization
): SerializedGeneration {
  return {
    id: generation.id,
    status: generation.status,
    imageUrl:
      generation.status === 'COMPLETED' && generation.imagePath ? imageUrlFor(generation) : null,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    completedAt: generation.completedAt,
    provider: generation.provider,
    model: generation.model,
    promptProvider: generation.promptProvider,
    promptModel: generation.promptModel,
    imageSize: generation.imageSize,
    imageQuality: generation.imageQuality,
    imageOutputFormat: generation.imageOutputFormat,
    imageStyle: generation.imageStyle,
    errorMessage: generation.errorMessage,
  };
}

async function getWrongNoteContext(userId: string, wrongNoteId: string) {
  const note = await prisma.wrongNote.findFirst({
    where: { id: wrongNoteId, userId },
    include: {
      question: {
        include: {
          knowledgePoint: { include: { parent: true } },
          options: { orderBy: { label: 'asc' } },
          userAnswers: {
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { selectedOption: true },
          },
        },
      },
    },
  });
  if (!note) throw Object.assign(new Error('错题不存在'), { status: 404 });
  if (note.question.type !== 'CHOICE')
    throw Object.assign(new Error('暂仅支持选择题错题生成讲解图'), { status: 400 });

  const latestWrong =
    note.question.userAnswers.find((answer) => !answer.isCorrect) ?? note.question.userAnswers[0];
  const wrongOptionId = latestWrong?.selectedOptionId ?? null;
  const wrongAnswerLabel = latestWrong?.selectedOption?.label ?? '';
  return { note, wrongOptionId, wrongAnswerLabel };
}

async function getRuntime(userId: string) {
  const promptConfig = await resolveAIConfig(userId);
  const imageConfig = await resolveAIImageConfig(userId);
  if (!promptConfig)
    throw Object.assign(new Error('请先配置文本 AI，用于生成讲解图提示词'), { status: 503 });
  if (!imageConfig) throw Object.assign(new Error('请先配置生图供应商'), { status: 503 });

  const promptProvider = buildAIProvider(promptConfig);
  const imageProvider = buildAIImageProvider(imageConfig);
  const promptInfo = promptProvider.getInfo();
  const imageInfo = imageProvider.getInfo();
  return {
    imageConfig,
    promptConfig,
    promptProvider,
    imageProvider,
    promptInfo,
    imageInfo,
  };
}

function buildFingerprint(params: {
  wrongNoteId: string;
  wrongOptionId: string | null;
  promptProvider: string;
  promptModel: string;
  imageProvider: string;
  imageModel: string;
  imageSize: string;
  imageQuality: string;
  imageOutputFormat: string;
  imageStyle: string;
  styleAnchorVersion: string;
  templateVersion: string;
}) {
  return crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

async function findLatestGeneration(userId: string, wrongNoteId: string, fingerprint: string) {
  return prisma.aIImageGeneration.findFirst({
    where: {
      userId,
      wrongNoteId,
      fingerprint,
      status: { in: ['COMPLETED', 'PENDING', 'RUNNING'] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function normalizeFinalImagePrompt(
  value: WrongNoteImagePromptResponse,
  styleAnchor: WrongNoteImageStyleAnchor
) {
  const prompt = typeof value.imagePrompt === 'string' ? value.imagePrompt.trim() : '';
  if (prompt.length < 80) throw new Error('AI 没有返回有效生图提示词');
  return `${prompt}

风格锚定：本次请求会附带一张「${styleAnchor.label}」锚定图作为参考输入。${styleAnchor.promptInstruction}
参考图只用于学习版式、线条、色彩、卡片比例和信息层级；不要复刻参考图里的示例题、数字、文字或内容。

硬性要求：只生成一张最终成品图，不要留白过多，不要生成中间素材。固定版式为左侧形象化解题过程图、右侧四个讲解框；四个框标题必须是「考点」「易错点」「正确思路」「记忆钩子」。左侧图必须具体表现本题解题动作，禁止抽象装饰图。中文必须清晰可读，不要水印、不要多余 logo、不要完整复刻原题和所有选项。`.slice(
    0,
    12000
  );
}

export async function getCurrentWrongNoteImageGeneration(userId: string, wrongNoteId: string) {
  const { wrongOptionId } = await getWrongNoteContext(userId, wrongNoteId);
  const runtime = await getRuntime(userId);
  const styleAnchor = getWrongNoteImageStyleAnchor(runtime.imageConfig.style);
  const fingerprint = buildFingerprint({
    wrongNoteId,
    wrongOptionId,
    promptProvider: runtime.promptInfo.name,
    promptModel: runtime.promptInfo.model,
    imageProvider: runtime.imageInfo.name,
    imageModel: runtime.imageInfo.model,
    imageSize: runtime.imageConfig.size,
    imageQuality: runtime.imageConfig.quality,
    imageOutputFormat: runtime.imageConfig.outputFormat,
    imageStyle: runtime.imageConfig.style,
    styleAnchorVersion: styleAnchor.version,
    templateVersion: WRONG_NOTE_IMAGE_TEMPLATE_VERSION,
  });
  return findLatestGeneration(userId, wrongNoteId, fingerprint);
}

export async function getLatestWrongNoteImageGeneration(userId: string, wrongNoteId: string) {
  const generations = await prisma.aIImageGeneration.findMany({
    where: { userId, wrongNoteId },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  return (
    generations.find(
      (generation) => generation.status === 'PENDING' || generation.status === 'RUNNING'
    ) ??
    generations.find((generation) => generation.status === 'COMPLETED' && generation.imagePath) ??
    generations.find((generation) => generation.status === 'FAILED') ??
    null
  );
}

export async function prepareWrongNoteImageGeneration(params: {
  userId: string;
  wrongNoteId: string;
  force?: boolean;
}) {
  const { note, wrongOptionId } = await getWrongNoteContext(params.userId, params.wrongNoteId);
  const runtime = await getRuntime(params.userId);
  const styleAnchor = getWrongNoteImageStyleAnchor(runtime.imageConfig.style);
  const fingerprint = buildFingerprint({
    wrongNoteId: params.wrongNoteId,
    wrongOptionId,
    promptProvider: runtime.promptInfo.name,
    promptModel: runtime.promptInfo.model,
    imageProvider: runtime.imageInfo.name,
    imageModel: runtime.imageInfo.model,
    imageSize: runtime.imageConfig.size,
    imageQuality: runtime.imageConfig.quality,
    imageOutputFormat: runtime.imageConfig.outputFormat,
    imageStyle: runtime.imageConfig.style,
    styleAnchorVersion: styleAnchor.version,
    templateVersion: WRONG_NOTE_IMAGE_TEMPLATE_VERSION,
  });

  if (!params.force) {
    const existing = await findLatestGeneration(params.userId, params.wrongNoteId, fingerprint);
    if (existing) {
      return {
        generation: existing,
        queued: existing.status === 'PENDING' || existing.status === 'RUNNING',
        reused: existing.status === 'COMPLETED',
        created: false,
      };
    }
  }

  if (!checkAIRateLimit(params.userId))
    throw Object.assign(new Error('AI 调用太频繁啦，请稍后再试'), { status: 429 });
  if (!(await checkAIImageRateLimit(params.userId)))
    throw Object.assign(new Error('生图调用太频繁啦，请稍后再试'), { status: 429 });

  const generation = await prisma.aIImageGeneration.create({
    data: {
      userId: params.userId,
      questionId: note.questionId,
      wrongNoteId: params.wrongNoteId,
      wrongOptionId,
      status: 'PENDING',
      provider: runtime.imageInfo.name,
      model: runtime.imageInfo.model,
      promptProvider: runtime.promptInfo.name,
      promptModel: runtime.promptInfo.model,
      imageSize: runtime.imageConfig.size,
      imageQuality: runtime.imageConfig.quality,
      imageOutputFormat: runtime.imageConfig.outputFormat,
      imageStyle: runtime.imageConfig.style,
      sourceImagePath: styleAnchor.publicPath,
      fingerprint,
    },
  });

  return { generation, queued: true, reused: false, created: true };
}

export async function runWrongNoteImageGeneration(generationId: string) {
  const generation = await prisma.aIImageGeneration.findUnique({ where: { id: generationId } });
  if (!generation || generation.status === 'COMPLETED') return;
  if (!generation.wrongNoteId) throw new Error('错题记录已不存在，无法生成讲解图');

  await prisma.aIImageGeneration.update({
    where: { id: generationId },
    data: { status: 'RUNNING', errorMessage: null },
  });

  try {
    const { note, wrongAnswerLabel } = await getWrongNoteContext(
      generation.userId,
      generation.wrongNoteId
    );
    const runtime = await getRuntime(generation.userId);

    const allContent = [note.question.content, ...note.question.options.map((o) => o.content)].join(
      '\n'
    );
    const imageUrls = extractImageUrls(allContent);

    if (imageUrls.length > 0 && !runtime.promptProvider.supportsVision()) {
      const { model } = runtime.promptInfo;
      const visionTested =
        runtime.promptConfig.visionSupport !== null &&
        runtime.promptConfig.visionSupport !== undefined;
      const errorMessage = visionTested
        ? `当前配置的模型（${model}）不支持视觉输入，无法生成含图错题的讲解图。请在个人中心切换支持视觉的模型（如 claude-sonnet-4-6、gpt-4o、gemini-2.5-flash 等）。`
        : `当前模型（${model}）的视觉能力尚未检测。请前往个人中心点击「测试视觉能力」，确认模型支持视觉输入后再生成含图错题讲解图。`;
      throw Object.assign(new Error(errorMessage), { status: 422 });
    }

    const imageSize = normalizeImageSize(generation.imageSize);
    const imageQuality = normalizeImageQuality(generation.imageQuality);
    const imageOutputFormat = normalizeImageOutputFormat(generation.imageOutputFormat);
    const imageStyle = normalizeImageStyle(generation.imageStyle);
    const imageProvider = buildAIImageProvider({
      ...runtime.imageConfig,
      model: generation.model || runtime.imageConfig.model,
      size: imageSize,
      quality: imageQuality,
      outputFormat: imageOutputFormat,
      style: imageStyle,
    });
    const styleAnchor = getWrongNoteImageStyleAnchor(imageStyle);
    const promptRaw = await runtime.promptProvider.createCompletion({
      systemPrompt: WRONG_NOTE_IMAGE_PROMPT_SYSTEM_PROMPT,
      userMessage: `${buildWrongNoteImagePromptUserMessage(note.question, wrongAnswerLabel)}

## 生图设置
- 目标尺寸：${imageSize}
- 卡片风格：${styleAnchor.label}（${imageStyle}）
- 风格锚定：${styleAnchor.promptInstruction}
- 生成方式：只输出一个 imagePrompt，由生图模型一次性生成最终错题复盘卡。`,
      maxTokens: 1200,
      temperature: 0.25,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
    });
    const imagePrompt = normalizeFinalImagePrompt(
      parseAIJson<WrongNoteImagePromptResponse>(promptRaw),
      styleAnchor
    );
    const finalImage = await imageProvider.generateImage({
      prompt: imagePrompt,
      size: imageSize,
      quality: imageQuality,
      outputFormat: imageOutputFormat,
      referenceImagePath: styleAnchor.filePath,
      inputFidelity: 'high',
      user: generation.userId,
    });
    const imagePath = await writeAIImageFile({
      userId: generation.userId,
      generationId,
      kind: 'final',
      extension: extensionForMimeType(finalImage.mimeType),
      buffer: finalImage.buffer,
    });

    await prisma.aIImageGeneration.update({
      where: { id: generationId },
      data: {
        status: 'COMPLETED',
        promptPayload: { imagePrompt } as unknown as Prisma.InputJsonValue,
        imagePrompt,
        imagePath,
        sourceImagePath: styleAnchor.publicPath,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.aIImageGeneration.update({
      where: { id: generationId },
      data: {
        status: 'FAILED',
        errorMessage: normalizeErrorMessage(error).slice(0, 1000),
      },
    });
    throw error;
  }
}
