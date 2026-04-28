import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { HISTORY_PAGE_SIZE } from '@/lib/constants';

export default async function ExamHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(params?.page) || 1));

  const [attempts, total, trendPool] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { userId: session.user.id },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        startedAt: true,
        totalScore: true,
        exam: { select: { title: true, totalScore: true } },
      },
    }),
    prisma.examAttempt.count({ where: { userId: session.user.id } }),
    prisma.examAttempt.findMany({
      where: { userId: session.user.id, status: 'COMPLETED' },
      orderBy: { startedAt: 'asc' },
      take: 30,
      select: { id: true, totalScore: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const maxScore = Math.max(1, ...trendPool.map((a) => a.totalScore ?? 0));

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Exam History</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl">考试历史</h1>
        <p className="mt-3 font-semibold text-muted">复盘每一次模拟考试，观察成绩变化趋势。</p>
      </section>
      <Card className="p-5 hover:translate-y-0 sm:p-7">
        <h2 className="mb-5 text-2xl font-black text-navy">成绩趋势</h2>
        <div className="flex h-40 items-end gap-3">
          {trendPool.map((attempt) => (
            <div key={attempt.id} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-2xl bg-primary"
                style={{ height: `${Math.max(8, ((attempt.totalScore ?? 0) / maxScore) * 130)}px` }}
              />
              <span className="text-xs font-black text-muted">{attempt.totalScore}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        {attempts.map((attempt) => (
          <Link
            key={attempt.id}
            href={`/exam/${attempt.id}/result`}
            className="ose-card flex flex-col justify-between gap-3 p-5 md:flex-row md:items-center"
          >
            <div>
              <h2 className="text-xl font-black text-navy">{attempt.exam.title}</h2>
              <p className="mt-1 font-semibold text-muted">
                {new Intl.DateTimeFormat('zh-CN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(attempt.startedAt)}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-4 py-2 font-black text-primary">
              {attempt.status === 'COMPLETED'
                ? `${attempt.totalScore}/${attempt.exam.totalScore}`
                : '未完成'}
            </span>
          </Link>
        ))}
      </div>
      {totalPages > 1 ? (
        <nav className="flex justify-center gap-3" aria-label="分页">
          {page > 1 ? (
            <Link
              className="rounded-2xl bg-white px-4 py-3 font-black text-navy shadow-soft"
              href={`/exam/history?page=${page - 1}`}
            >
              上一页
            </Link>
          ) : null}
          <span className="rounded-2xl bg-white px-4 py-3 font-black text-muted">
            {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              className="rounded-2xl bg-white px-4 py-3 font-black text-navy shadow-soft"
              href={`/exam/history?page=${page + 1}`}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
