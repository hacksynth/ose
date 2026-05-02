import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAIProvider, isAIConfigured, resolveAIConfig } from "@/lib/ai";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { createAIErrorResponse, extractImageUrls, streamText } from "@/lib/ai/utils";
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserMessage } from "@/lib/ai/prompts";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    const userId = session.user.id;
    if (!(await isAIConfigured(userId))) return NextResponse.json({ message: "请在个人中心填入 API Key 或设置环境变量以启用 AI" }, { status: 503 });
    if (!checkAIRateLimit(userId)) return NextResponse.json({ message: "AI 调用太频繁啦，请稍后再试" }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const questionId = String(body.questionId ?? "");
    const userAnswerOptionId = body.userAnswerOptionId ? String(body.userAnswerOptionId) : "";
    const question = await prisma.question.findUnique({ where: { id: questionId }, include: { options: { orderBy: { label: "asc" } } } });
    if (!question) return NextResponse.json({ message: "题目不存在" }, { status: 404 });
    const selected = question.options.find((option) => option.id === userAnswerOptionId);
    const userMessage = buildExplainUserMessage(question, selected?.label ?? "未选择", Boolean(selected?.isCorrect));

    const allContent = [question.content, ...question.options.map((o) => o.content)].join("\n");
    const imageUrls = extractImageUrls(allContent);

    const config = await resolveAIConfig(userId);
    if (!config) return NextResponse.json({ message: "请在个人中心填入 API Key 或设置环境变量以启用 AI" }, { status: 503 });
    const provider = buildAIProvider(config);

    if (imageUrls.length > 0 && !provider.supportsVision()) {
      const { model } = provider.getInfo();
      const visionTested = config.visionSupport !== null && config.visionSupport !== undefined;
      const message = visionTested
        ? `当前配置的模型（${model}）不支持视觉输入，无法分析题目中的图片。如需对含图题进行 AI 深度讲解，请在个人中心切换支持视觉的模型（如 claude-sonnet-4-6、gpt-4o、gemini-2.5-flash 等）。`
        : `当前模型（${model}）的视觉能力尚未检测。请前往个人中心点击「测试视觉能力」，确认模型支持视觉输入后再进行含图题讲解。`;
      return NextResponse.json({ message }, { status: 422 });
    }

    return streamText(provider.streamCompletion({
      systemPrompt: EXPLAIN_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1600,
      temperature: 0.2,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
    }));
  } catch (error) {
    return createAIErrorResponse(error);
  }
}
