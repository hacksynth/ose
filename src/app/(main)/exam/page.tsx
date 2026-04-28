import Link from 'next/link';
import { Clock3, FileText, History } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExamActions, GenerateExamButton } from '@/components/exam-actions';

export default async function ExamPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [exams, inProgress] = await Promise.all([
    prisma.exam.findMany({
      where: userId
        ? { OR: [{ createdByUserId: null }, { createdByUserId: userId }] }
        : { createdByUserId: null },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { questions: true } },
        attempts: {
          where: { userId: userId ?? '' },
          orderBy: { startedAt: 'desc' },
          select: { id: true, status: true, totalScore: true, startedAt: true },
        },
      },
    }),
    userId
      ? prisma.examAttempt.findFirst({
          where: { userId, status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
          include: { exam: { select: { title: true } } },
        })
      : null,
  ]);
  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-sm font-black text-primary">Mock Exam</p>
            <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">模拟考试</h1>
            <p className="mt-3 font-semibold text-muted">
              按真实考试节奏完成整套训练，交卷后统一判分。
            </p>
          </div>
          <div className="grid gap-3 sm:flex">
            <GenerateExamButton />
            <Button asChild variant="secondary">
              <Link href="/exam/history">
                <History className="h-4 w-4" />
                考试历史
              </Link>
            </Button>
          </div>
        </div>
        {inProgress ? (
          <div className="mt-6 rounded-3xl bg-softYellow p-5">
            <p className="font-black text-navy">你有一场未完成的考试：{inProgress.exam.title}</p>
            <Button asChild className="mt-3">
              <Link href={`/exam/${inProgress.id}`}>继续考试</Link>
            </Button>
          </div>
        ) : null}
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        {exams.map((exam) => {
          const completed = exam.attempts.filter((a) => a.status === 'COMPLETED');
          const bestScore = completed.reduce((max, a) => Math.max(max, a.totalScore ?? 0), 0);
          const last = exam.attempts[0];
          return (
            <Card key={exam.id} className="p-5 sm:p-7">
              <FileText className="h-10 w-10 text-primary" />
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">
                  {exam.session === 'AM' ? '上午卷' : exam.session === 'PM' ? '下午卷' : '全真卷'}
                </span>
                <span className="rounded-full bg-softBlue px-3 py-1 text-xs font-black text-navy">
                  {exam._count.questions} 题
                </span>
                <span className="rounded-full bg-softGreen px-3 py-1 text-xs font-black text-navy">
                  <Clock3 className="mr-1 inline h-3 w-3" />
                  {exam.timeLimit} 分钟
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-black text-navy">{exam.title}</h2>
              <p className="mt-2 font-semibold text-muted">
                历史最高分：{bestScore ? `${bestScore}/${exam.totalScore}` : '暂无'}
              </p>
              <div className="mt-6 grid gap-3 sm:flex">
                <ExamActions
                  exam={{
                    id: exam.id,
                    title: exam.title,
                    session: exam.session,
                    timeLimit: exam.timeLimit,
                    totalScore: exam.totalScore,
                    questionCount: exam._count.questions,
                    bestScore,
                    lastAttempt: last ?? null,
                  }}
                />
                {last?.status === 'COMPLETED' ? (
                  <Button asChild variant="secondary">
                    <Link href={`/exam/${last.id}/result`}>查看成绩</Link>
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
