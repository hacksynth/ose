import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAIProvider, isAIConfigured } from '@/lib/ai';
import { buildLearningKnowledgeBase } from '@/lib/ai/learning-context';
import { checkAIRateLimit } from '@/lib/ai/rate-limit';
import {
  TODAY_PLAN_DIAGNOSIS_SYSTEM_PROMPT,
  buildTodayPlanDiagnosisUserMessage,
} from '@/lib/ai/prompts';
import { createAIErrorResponse, streamText } from '@/lib/ai/utils';
import { prisma } from '@/lib/prisma';
import { getChinaDateKey } from '@/lib/stats';

function tasksFromJson(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((task) => String(task ?? '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function normalizeDayNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const userId = session.user.id;
    if (!(await isAIConfigured(userId))) {
      return NextResponse.json(
        { message: '请在个人中心填入 API Key 或设置环境变量以启用 AI' },
        { status: 503 }
      );
    }
    if (!checkAIRateLimit(userId)) {
      return NextResponse.json({ message: 'AI 调用太频繁啦，请稍后再试' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
    const requestedDayNumber = normalizeDayNumber(body.dayNumber);
    if (!planId) return NextResponse.json({ message: '缺少计划 ID' }, { status: 400 });

    const [plan, planUser] = await Promise.all([
      prisma.studyPlan.findFirst({
        where: { id: planId, userId },
        select: {
          title: true,
          targetExamDate: true,
          days: {
            orderBy: { dayNumber: 'asc' },
            select: { dayNumber: true, date: true, tasks: true, completed: true },
          },
        },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { targetExamDate: true } }),
    ]);
    if (!plan) return NextResponse.json({ message: '计划不存在' }, { status: 404 });

    const todayKey = getChinaDateKey(new Date());
    const day =
      (requestedDayNumber
        ? plan.days.find((item) => item.dayNumber === requestedDayNumber)
        : null) ??
      plan.days.find((item) => getChinaDateKey(item.date) === todayKey) ??
      plan.days.find((item) => !item.completed) ??
      plan.days[0];
    if (!day) return NextResponse.json({ message: '计划中没有任务日' }, { status: 400 });

    const tasks = tasksFromJson(day.tasks);
    if (!tasks.length)
      return NextResponse.json({ message: '今日任务为空，无法诊断' }, { status: 400 });

    const [provider, learningKnowledgeBase] = await Promise.all([
      getAIProvider(userId),
      buildLearningKnowledgeBase(userId),
    ]);
    const userMessage = buildTodayPlanDiagnosisUserMessage({
      planTitle: plan.title,
      targetExamDate: getChinaDateKey(planUser?.targetExamDate ?? plan.targetExamDate),
      dayNumber: day.dayNumber,
      date: getChinaDateKey(day.date),
      completed: day.completed,
      tasks,
      learningKnowledgeBase,
    });

    return streamText(
      provider.streamCompletion({
        systemPrompt: TODAY_PLAN_DIAGNOSIS_SYSTEM_PROMPT,
        userMessage,
        maxTokens: 1600,
        temperature: 0.25,
      })
    );
  } catch (error) {
    return createAIErrorResponse(error);
  }
}
