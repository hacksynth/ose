import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CaseFigures } from '@/components/case-figures';

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { attemptId } = await params;
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: session.user.id },
    include: {
      exam: {
        include: {
          questions: {
            orderBy: { orderNumber: 'asc' },
            include: {
              question: {
                include: {
                  options: { orderBy: { label: 'asc' } },
                  knowledgePoint: { include: { parent: true } },
                  caseScenario: { include: { subQuestions: { orderBy: { subNumber: 'asc' } } } },
                },
              },
            },
          },
        },
      },
      answers: true,
    },
  });
  if (!attempt) notFound();
  const previous = await prisma.examAttempt.findFirst({
    where: {
      userId: session.user.id,
      examId: attempt.examId,
      status: 'COMPLETED',
      startedAt: { lt: attempt.startedAt },
    },
    orderBy: { startedAt: 'desc' },
  });
  const passScore = Math.ceil(attempt.exam.totalScore * 0.6);
  const pass = (attempt.totalScore ?? 0) >= passScore;
  const diff =
    previous?.totalScore != null && attempt.totalScore != null
      ? attempt.totalScore - previous.totalScore
      : null;
  const subIds = attempt.exam.questions.flatMap(
    (examQuestion) => examQuestion.question.caseScenario?.subQuestions.map((sub) => sub.id) ?? []
  );
  const caseAnswers = subIds.length
    ? await prisma.userCaseAnswer.findMany({
        where: { userId: session.user.id, caseSubQuestionId: { in: subIds } },
      })
    : [];
  const caseGradeBySubId = new Map(
    caseAnswers.map((item) => [
      item.caseSubQuestionId,
      { score: item.score ?? 0, feedback: item.feedback ?? '' },
    ])
  );
  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <Card className="bg-white/90 p-5 sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">成绩报告</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl">{attempt.exam.title}</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-softYellow p-6">
            <p className="font-black text-muted">总分</p>
            <p className="mt-2 text-4xl font-black text-navy sm:text-5xl">
              {attempt.totalScore ?? 0}
              <span className="text-xl">/{attempt.exam.totalScore}</span>
            </p>
          </div>
          <div className={pass ? 'rounded-3xl bg-softGreen p-6' : 'rounded-3xl bg-softRose p-6'}>
            <p className="font-black text-muted">状态</p>
            <p className="mt-2 text-3xl font-black text-navy">{pass ? '通过' : '未通过'}</p>
            <p className="mt-2 text-sm font-black text-muted">及格线 {passScore} 分</p>
          </div>
          <div className="rounded-3xl bg-softBlue p-6">
            <p className="font-black text-muted">选择题</p>
            <p className="mt-2 text-4xl font-black text-navy">{attempt.choiceScore ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-[#E9D5FF] p-6">
            <p className="font-black text-muted">案例题</p>
            <p className="mt-2 text-4xl font-black text-navy">{attempt.caseScore ?? 0}</p>
          </div>
        </div>
        {diff !== null ? (
          <p className="mt-5 font-black text-primary">
            比上次{diff >= 0 ? '提高' : '降低'}了 {Math.abs(diff)} 分
          </p>
        ) : null}
        <div className="mt-6 grid gap-3 sm:flex">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/wrong-notes">查看错题</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/exam">返回考试列表</Link>
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        {attempt.exam.questions.map((examQuestion) => {
          const answer = attempt.answers.find(
            (item) => item.questionId === examQuestion.questionId
          );
          const q = examQuestion.question;
          const correctOption = q.options.find((o) => o.isCorrect);
          return (
            <details key={examQuestion.id} className="ose-card p-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <h2 className="font-black text-navy">
                  第 {examQuestion.orderNumber} 题 · {q.content}
                </h2>
                {q.type === 'CHOICE' ? (
                  answer?.isCorrect ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )
                ) : (
                  <span className="rounded-full bg-primary-soft px-3 py-1 font-black text-primary">
                    {answer?.score ?? 0} 分
                  </span>
                )}
              </summary>
              {q.type === 'CHOICE' ? (
                <div className="mt-4 space-y-2">
                  <p className="font-semibold text-muted">
                    你的答案：
                    {q.options.find((o) => o.id === answer?.selectedOptionId)?.label ?? '未答'}
                  </p>
                  <p className="font-semibold text-green-700">
                    正确答案：{correctOption?.label}. {correctOption?.content}
                  </p>
                  <p className="font-semibold leading-7 text-muted">解析：{q.explanation}</p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <CaseFigures figures={q.caseScenario?.figures} />
                  {q.caseScenario?.subQuestions.map((sub) => {
                    const caseMap = (answer?.caseAnswers ?? {}) as Record<string, string>;
                    const grade = caseGradeBySubId.get(sub.id);
                    const subScore = grade?.score ?? 0;
                    return (
                      <div key={sub.id} className="rounded-3xl bg-white p-4 shadow-sm">
                        <p className="font-black text-navy">
                          （{sub.subNumber}）{sub.content} · {subScore}/{sub.score}分
                        </p>
                        <p className="mt-2 font-semibold text-muted">
                          你的答案：{caseMap[sub.id] || '未答'}
                        </p>
                        <p className="mt-2 font-semibold text-green-700">
                          参考答案：{sub.referenceAnswer}
                        </p>
                        {grade?.feedback ? (
                          <p className="mt-2 font-semibold text-muted">批改：{grade.feedback}</p>
                        ) : null}
                        <p className="mt-2 font-semibold text-muted">解析：{sub.explanation}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </main>
  );
}
