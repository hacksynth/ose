import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAIProvider, isAIConfigured } from "@/lib/ai";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { createAIErrorResponse, streamText } from "@/lib/ai/utils";
import { DIAGNOSIS_SYSTEM_PROMPT, buildDiagnosisUserMessage } from "@/lib/ai/prompts";
import { getUserAnalysis } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    const userId = session.user.id;
    if (!(await isAIConfigured(userId))) return NextResponse.json({ message: "请在个人中心填入 API Key 或设置环境变量以启用 AI" }, { status: 503 });
    if (!checkAIRateLimit(userId)) return NextResponse.json({ message: "AI 调用太频繁啦，请稍后再试" }, { status: 429 });
    const diagUser = await prisma.user.findUnique({ where: { id: userId }, select: { targetExamDate: true } });
    const stats = await getUserAnalysis(userId, diagUser?.targetExamDate);
    const userMessage = buildDiagnosisUserMessage({ overview: stats.overview, knowledgePoints: stats.knowledgePoints });
    const provider = await getAIProvider(userId);
    return streamText(provider.streamCompletion({ systemPrompt: DIAGNOSIS_SYSTEM_PROMPT, userMessage, maxTokens: 1800, temperature: 0.3 }));
  } catch (error) {
    return createAIErrorResponse(error);
  }
}
