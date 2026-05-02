import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateLearning } from "@/lib/ai/context-cache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const questionId = String(body.questionId ?? "");
  const selectedOptionId = String(body.selectedOptionId ?? "");
  const rawSessionId = body.sessionId ? String(body.sessionId) : undefined;
  const timeSpent = Math.min(3600, Math.max(1, Number.isFinite(Number(body.timeSpent)) ? Number(body.timeSpent) : 1));

  if (!questionId || !selectedOptionId) {
    return NextResponse.json({ message: "参数不完整" }, { status: 400 });
  }

  let practiceSessionId: string | undefined;
  if (rawSessionId) {
    const owned = await prisma.practiceSession.findFirst({ where: { id: rawSessionId, userId }, select: { id: true } });
    if (!owned) return NextResponse.json({ message: "练习会话不存在或无权访问" }, { status: 403 });
    practiceSessionId = owned.id;
  }

  const [question, selectedOption] = await Promise.all([
    prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        explanation: true,
        knowledgePoint: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
        options: { select: { id: true, label: true, content: true, isCorrect: true }, orderBy: { label: "asc" } },
      },
    }),
    prisma.questionOption.findUnique({ where: { id: selectedOptionId }, select: { id: true, questionId: true, isCorrect: true } }),
  ]);

  if (!question || !selectedOption || selectedOption.questionId !== questionId) {
    return NextResponse.json({ message: "题目或选项不存在" }, { status: 404 });
  }

  const answer = await prisma.$transaction(async (tx) => {
    const created = await tx.userAnswer.create({
      data: { userId, questionId, selectedOptionId, practiceSessionId, isCorrect: selectedOption.isCorrect, timeSpent },
    });
    if (!selectedOption.isCorrect) {
      await tx.wrongNote.upsert({
        where: { userId_questionId: { userId, questionId } },
        update: { markedMastered: false },
        create: { userId, questionId },
      });
    }
    if (practiceSessionId) {
      const answered = await tx.userAnswer.count({ where: { userId, practiceSessionId } });
      const practiceSession = await tx.practiceSession.findFirst({ where: { id: practiceSessionId, userId }, select: { total: true, completedAt: true } });
      if (practiceSession && !practiceSession.completedAt && answered >= practiceSession.total) {
        await tx.practiceSession.update({ where: { id: practiceSessionId }, data: { completedAt: new Date() } });
      }
    }
    return created;
  });

  invalidateLearning(userId);

  return NextResponse.json({
    answerId: answer.id,
    isCorrect: selectedOption.isCorrect,
    explanation: question.explanation,
    correctOptionId: question.options.find((option) => option.isCorrect)?.id,
    options: question.options,
    knowledgePoint: question.knowledgePoint,
  });
}
