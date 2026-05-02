import { buildAIProvider, resolveAIConfig } from '@/lib/ai';
import { checkAIRateLimit } from '@/lib/ai/rate-limit';
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserMessage } from '@/lib/ai/prompts';
import { extractImageUrls, normalizeErrorMessage } from '@/lib/ai/utils';
import { prisma } from '@/lib/prisma';

type SerializedExplanationGeneration = {
  id: string;
  status: string;
  content: string | null;
  errorMessage: string | null;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type GenerationForSerialization = {
  id: string;
  status: string;
  content: string | null;
  errorMessage: string | null;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export function serializeExplanationGeneration(
  generation: GenerationForSerialization
): SerializedExplanationGeneration {
  return {
    id: generation.id,
    status: generation.status,
    content: generation.status === 'COMPLETED' ? generation.content : null,
    errorMessage: generation.errorMessage,
    provider: generation.provider,
    model: generation.model,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    completedAt: generation.completedAt,
  };
}

async function getWrongNoteContext(userId: string, wrongNoteId: string) {
  const note = await prisma.wrongNote.findFirst({
    where: { id: wrongNoteId, userId },
    include: {
      question: {
        include: {
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

  const latestWrong =
    note.question.userAnswers.find((answer) => !answer.isCorrect) ?? note.question.userAnswers[0];
  const wrongOptionId = latestWrong?.selectedOptionId ?? null;
  const wrongAnswerLabel = latestWrong?.selectedOption?.label ?? '';
  const isCorrect = latestWrong?.isCorrect ?? false;
  return { note, wrongOptionId, wrongAnswerLabel, isCorrect };
}

export async function getLatestWrongNoteExplanationGeneration(userId: string, wrongNoteId: string) {
  const generations = await prisma.aIExplanationGeneration.findMany({
    where: { userId, wrongNoteId },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  return (
    generations.find((g) => g.status === 'PENDING' || g.status === 'RUNNING') ??
    generations.find((g) => g.status === 'COMPLETED' && g.content) ??
    generations.find((g) => g.status === 'FAILED') ??
    null
  );
}

export async function prepareAndRunWrongNoteExplanation(params: {
  userId: string;
  wrongNoteId: string;
  force?: boolean;
}): Promise<{ generation: GenerationForSerialization; reused: boolean }> {
  const { note, wrongOptionId, wrongAnswerLabel, isCorrect } = await getWrongNoteContext(
    params.userId,
    params.wrongNoteId
  );

  if (!params.force) {
    const existing = await prisma.aIExplanationGeneration.findFirst({
      where: {
        userId: params.userId,
        wrongNoteId: params.wrongNoteId,
        status: { in: ['COMPLETED', 'PENDING', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { generation: existing, reused: true };
    }
  }

  if (!checkAIRateLimit(params.userId))
    throw Object.assign(new Error('AI 调用太频繁啦，请稍后再试'), { status: 429 });

  const config = await resolveAIConfig(params.userId);
  if (!config)
    throw Object.assign(
      new Error('请在个人中心填入 API Key 或设置环境变量以启用 AI'),
      { status: 503 }
    );

  const provider = buildAIProvider(config);
  const info = provider.getInfo();

  const allContent = [
    note.question.content,
    ...note.question.options.map((o) => o.content),
  ].join('\n');
  const imageUrls = extractImageUrls(allContent);

  if (imageUrls.length > 0 && !provider.supportsVision()) {
    const { model } = provider.getInfo();
    const visionTested = config.visionSupport !== null && config.visionSupport !== undefined;
    const errorMessage = visionTested
      ? `当前配置的模型（${model}）不支持视觉输入，无法分析题目中的图片。如需对含图题进行 AI 深度讲解，请在个人中心切换支持视觉的模型（如 claude-sonnet-4-6、gpt-4o、gemini-2.5-flash 等）。`
      : `当前模型（${model}）的视觉能力尚未检测。请前往个人中心点击「测试视觉能力」，确认模型支持视觉输入后再进行含图题讲解。`;
    throw Object.assign(new Error(errorMessage), { status: 422 });
  }

  const generation = await prisma.aIExplanationGeneration.create({
    data: {
      userId: params.userId,
      questionId: note.questionId,
      wrongNoteId: params.wrongNoteId,
      wrongOptionId,
      status: 'RUNNING',
      provider: info.name,
      model: info.model,
    },
  });

  try {
    const userMessage = buildExplainUserMessage(
      note.question,
      wrongAnswerLabel,
      isCorrect
    );

    const content = await provider.createCompletion({
      systemPrompt: EXPLAIN_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1600,
      temperature: 0.2,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
    });

    const completed = await prisma.aIExplanationGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'COMPLETED',
        content,
        completedAt: new Date(),
      },
    });

    return { generation: completed, reused: false };
  } catch (error) {
    const failed = await prisma.aIExplanationGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'FAILED',
        errorMessage: normalizeErrorMessage(error).slice(0, 1000),
      },
    });
    throw Object.assign(error instanceof Error ? error : new Error(normalizeErrorMessage(error)), {
      generation: failed,
    });
  }
}
