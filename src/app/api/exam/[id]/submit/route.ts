import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeCaseLocal, gradeCaseWithAI } from "@/lib/grade";
import { invalidateLearning } from "@/lib/ai/context-cache";

type CaseAnswerMap = Record<string, string>;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const userId = session.user.id;
  const { id: attemptId } = await params;

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      exam: { include: { questions: { include: { question: { include: { options: true, caseScenario: { include: { subQuestions: true } } } } }, orderBy: { orderNumber: "asc" } } } },
      answers: true,
    },
  });
  if (!attempt) return NextResponse.json({ message: "考试不存在" }, { status: 404 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ message: "该考试已交卷" }, { status: 409 });

  const caseQuestions = attempt.exam.questions.filter((eq) => eq.question.type === "CASE_ANALYSIS" && eq.question.caseScenario);

  // Grade all case questions in parallel — AI grading is the main bottleneck when done serially.
  const caseGradeResults = await Promise.all(
    caseQuestions.map(async (examQuestion) => {
      const scenario = examQuestion.question.caseScenario!;
      const saved = attempt.answers.find((answer) => answer.questionId === examQuestion.questionId);
      const answerMap = (saved?.caseAnswers ?? {}) as CaseAnswerMap;
      const stringAnswers: Record<string, string> = Object.fromEntries(
        scenario.subQuestions.map((sub) => [sub.id, String(answerMap[sub.id] ?? "")]),
      );
      const aiGraded = await gradeCaseWithAI(
        { background: scenario.background },
        scenario.subQuestions,
        stringAnswers,
        userId,
      );
      const graded = aiGraded ?? gradeCaseLocal(scenario.subQuestions, stringAnswers);
      return { questionId: examQuestion.questionId, graded, answers: stringAnswers };
    }),
  );
  const caseGradesByQuestionId = new Map(caseGradeResults.map((row) => [row.questionId, row]));

  let choiceScore = 0;
  let caseScore = 0;
  const choiceUpdates: Array<{ id: string; isCorrect: boolean | null; score: number }> = [];
  const caseAnswerUpdates: Array<{ id: string; score: number }> = [];
  const wrongQuestionIds: string[] = [];
  const caseUpserts: Array<{ subId: string; answer: string; score: number; feedback: string }> = [];

  for (const examQuestion of attempt.exam.questions) {
    const saved = attempt.answers.find((answer) => answer.questionId === examQuestion.questionId);
    if (examQuestion.question.type === "CHOICE") {
      const hasPick = Boolean(saved?.selectedOptionId);
      const correct = hasPick ? examQuestion.question.options.find((o) => o.id === saved!.selectedOptionId)?.isCorrect ?? false : false;
      if (correct) choiceScore += 1;
      if (saved) choiceUpdates.push({ id: saved.id, isCorrect: hasPick ? correct : null, score: correct ? 1 : 0 });
      if (hasPick && !correct) wrongQuestionIds.push(examQuestion.questionId);
    } else if (examQuestion.question.caseScenario) {
      const gradeResult = caseGradesByQuestionId.get(examQuestion.questionId);
      const graded = gradeResult?.graded ?? [];
      const score = graded.reduce((sum, item) => sum + item.score, 0);
      caseScore += score;
      if (saved) caseAnswerUpdates.push({ id: saved.id, score });
      for (const sub of examQuestion.question.caseScenario.subQuestions) {
        const record = graded.find((item) => item.subId === sub.id);
        if (!record) continue;
        caseUpserts.push({
          subId: sub.id,
          answer: gradeResult?.answers[sub.id] ?? "",
          score: record.score,
          feedback: record.feedback,
        });
      }
    }
  }

  const totalScore = choiceScore + caseScore;
  await prisma.$transaction(async (tx) => {
    // Batch answer score/correctness updates — single round-trip per bucket.
    await Promise.all([
      ...choiceUpdates.map((update) =>
        tx.examAnswer.update({ where: { id: update.id }, data: { isCorrect: update.isCorrect, score: update.score } }),
      ),
      ...caseAnswerUpdates.map((update) =>
        tx.examAnswer.update({ where: { id: update.id }, data: { score: update.score } }),
      ),
    ]);

    await tx.examAttempt.update({
      where: { id: attemptId },
      data: { status: "COMPLETED", finishedAt: new Date(), totalScore, choiceScore, caseScore },
    });

    if (caseUpserts.length) {
      await Promise.all(
        caseUpserts.map((item) =>
          tx.userCaseAnswer.upsert({
            where: { userId_caseSubQuestionId: { userId, caseSubQuestionId: item.subId } },
            update: { answer: item.answer, score: item.score, feedback: item.feedback },
            create: { userId, caseSubQuestionId: item.subId, answer: item.answer, score: item.score, feedback: item.feedback },
          }),
        ),
      );
    }

    if (wrongQuestionIds.length) {
      const existing = await tx.wrongNote.findMany({
        where: { userId, questionId: { in: wrongQuestionIds } },
        select: { questionId: true },
      });
      const existingIds = new Set(existing.map((row) => row.questionId));
      const toCreate = wrongQuestionIds.filter((id) => !existingIds.has(id));
      const toUpdate = wrongQuestionIds.filter((id) => existingIds.has(id));
      if (toCreate.length) {
        await tx.wrongNote.createMany({ data: toCreate.map((questionId) => ({ userId, questionId })) });
      }
      if (toUpdate.length) {
        await tx.wrongNote.updateMany({
          where: { userId, questionId: { in: toUpdate } },
          data: { markedMastered: false },
        });
      }
    }
  });

  invalidateLearning(userId);

  return NextResponse.json({ totalScore, choiceScore, caseScore });
}
