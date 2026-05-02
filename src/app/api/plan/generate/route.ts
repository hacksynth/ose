import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAIProvider, isAIConfigured } from "@/lib/ai";
import { checkAIRateLimit } from "@/lib/ai/rate-limit";
import { createAIErrorResponse } from "@/lib/ai/utils";
import { parseAIJson } from "@/lib/ai/json";
import { STUDY_PLAN_SYSTEM_PROMPT, buildStudyPlanUserMessage } from "@/lib/ai/prompts";
import { getUserAnalysis } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";
import { parseFiniteDate } from "@/lib/validate";
import { invalidateLearningStable } from "@/lib/ai/context-cache";

const MAX_PLAN_DAYS = 60;

type PlanJson = { overview?: string; days?: Array<{ dayNumber?: number; tasks?: unknown }> };

function dayRowsFromMarkdown(content: string, totalDays: number, startDate: Date) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const taskLines = lines.filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, ""));
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(startDate.getTime() + index * 86_400_000);
    const offset = index * 3;
    const tasks = taskLines.slice(offset, offset + 3);
    return { dayNumber: index + 1, date, tasks: tasks.length ? tasks : [`复习薄弱知识点 ${index + 1}`, "完成 15 道选择题", "整理错题笔记"] };
  });
}

function dayRowsFromJson(json: PlanJson, totalDays: number, startDate: Date) {
  const byDay = new Map<number, string[]>();
  if (Array.isArray(json.days)) {
    for (const entry of json.days) {
      const dayNumber = Number(entry?.dayNumber);
      if (!Number.isFinite(dayNumber) || dayNumber < 1) continue;
      const tasks = Array.isArray(entry.tasks)
        ? entry.tasks.map((task) => String(task ?? "").trim()).filter(Boolean).slice(0, 8)
        : [];
      if (tasks.length) byDay.set(dayNumber, tasks);
    }
  }
  if (!byDay.size) return null;
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(startDate.getTime() + index * 86_400_000);
    const tasks = byDay.get(index + 1);
    return { dayNumber: index + 1, date, tasks: tasks && tasks.length ? tasks : [`复习薄弱知识点 ${index + 1}`, "完成 15 道选择题", "整理错题笔记"] };
  });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    const userId = session.user.id;
    if (!(await isAIConfigured(userId))) return NextResponse.json({ message: "请在个人中心填入 API Key 或设置环境变量以启用 AI" }, { status: 503 });
    if (!checkAIRateLimit(userId)) return NextResponse.json({ message: "AI 调用太频繁啦，请稍后再试" }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const targetDate = parseFiniteDate(body.targetDate);
    if (!targetDate) {
      return NextResponse.json({ message: "targetDate 参数不合法" }, { status: 400 });
    }
    const dailyTime = String(body.dailyTime ?? "1小时").slice(0, 40);
    const preferences = Array.isArray(body.preferences) ? body.preferences.map((item: unknown) => String(item).slice(0, 40)).slice(0, 10) : ["侧重薄弱环节"];
    const today = new Date();
    const rawDays = Math.ceil((targetDate.getTime() - today.getTime()) / 86_400_000);
    const totalDays = Math.max(1, Math.min(365, rawDays));
    const generatedDays = Math.min(totalDays, MAX_PLAN_DAYS);
    const analysis = await getUserAnalysis(userId);
    const userMessage = buildStudyPlanUserMessage({
      targetDate: targetDate.toISOString().slice(0, 10),
      daysLeft: totalDays,
      dailyTime,
      preferences,
      overallMastery: analysis.overview.overallMastery,
      knowledgeStats: analysis.knowledgePoints.map((kp) => `- ${kp.name}: ${kp.mastery}%`).join("\n"),
      weakPoints: analysis.weakPoints.map((kp) => `- ${kp.name}: 掌握度${kp.mastery}%, 正确率${kp.accuracy}%`).join("\n"),
    });
    const provider = await getAIProvider(userId);
    const completion = await provider.createCompletion({ systemPrompt: STUDY_PLAN_SYSTEM_PROMPT, userMessage, maxTokens: 4000, temperature: 0.4 });
    let overviewContent = completion;
    let dayRows: Array<{ dayNumber: number; date: Date; tasks: string[] }> | null = null;
    try {
      const json = parseAIJson<PlanJson>(completion);
      const fromJson = dayRowsFromJson(json, generatedDays, today);
      if (fromJson) {
        dayRows = fromJson;
        if (typeof json.overview === "string" && json.overview.trim()) overviewContent = json.overview.trim();
      }
    } catch {
      // fall through to markdown heuristic
    }
    if (!dayRows) dayRows = dayRowsFromMarkdown(completion, generatedDays, today);
    const plan = await prisma.$transaction(async (tx) =>
      tx.studyPlan.create({
        data: {
          userId,
          title: `软件设计师备考计划（${targetDate.toISOString().slice(0, 10)}）`,
          content: overviewContent,
          targetExamDate: targetDate,
          totalDays: generatedDays,
          days: { create: dayRows },
        },
      }),
    );
    invalidateLearningStable(userId);
    return NextResponse.json({ planId: plan.id, content: overviewContent });
  } catch (error) {
    return createAIErrorResponse(error);
  }
}
