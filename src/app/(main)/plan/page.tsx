import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getNextExamCountdown } from '@/lib/stats';
import { Card } from '@/components/ui/card';
import { PlanGenerateForm } from '@/components/plan-generate-form';
import { PlanDeleteButton } from '@/components/plan-delete-button';
import { PAGE_SIZE_DEFAULT } from '@/lib/constants';

const PAGE_SIZE = PAGE_SIZE_DEFAULT;

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(params?.page) || 1));
  const [plans, total, user] = await Promise.all([
    prisma.studyPlan.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        status: true,
        targetExamDate: true,
        totalDays: true,
        createdAt: true,
        days: { select: { completed: true } },
      },
    }),
    prisma.studyPlan.count({ where: { userId: session.user.id } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { targetExamDate: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exam = getNextExamCountdown();
  const defaultTargetDate = user?.targetExamDate ?? exam.date;
  return (
    <main className="mx-auto mt-8 max-w-7xl space-y-8">
      <section className="rounded-[2rem] bg-white/90 p-8 shadow-soft">
        <p className="mb-3 text-sm font-black text-primary">Study Plan</p>
        <h1 className="text-4xl font-black text-navy md:text-5xl">智能学习计划</h1>
        <p className="mt-3 font-semibold text-muted">根据薄弱点和考试日期生成可执行的每日任务。</p>
      </section>
      <Card className="p-7 hover:translate-y-0">
        <h2 className="mb-5 text-2xl font-black text-navy">生成新计划</h2>
        <PlanGenerateForm defaultDate={defaultTargetDate.toISOString().slice(0, 10)} />
      </Card>
      <section className="grid gap-5 md:grid-cols-2">
        {plans.map((plan) => {
          const completed = plan.days.filter((day) => day.completed).length;
          const ratio = plan.days.length ? (completed / plan.days.length) * 100 : 0;
          return (
            <article key={plan.id} className="ose-card relative p-6">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/plan/${plan.id}`} className="min-w-0 flex-1">
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">
                    {plan.status}
                  </span>
                  <h2 className="mt-4 text-2xl font-black text-navy">{plan.title}</h2>
                  <p className="mt-2 font-semibold text-muted">
                    目标日期 {plan.targetExamDate.toISOString().slice(0, 10)} · {completed}/
                    {plan.days.length} 天已完成
                  </p>
                </Link>
                <PlanDeleteButton planId={plan.id} className="shrink-0" />
              </div>
              <Link href={`/plan/${plan.id}`} aria-label={`查看${plan.title}`}>
                <div
                  className="mt-4 h-3 overflow-hidden rounded-full bg-orange-100"
                  role="progressbar"
                  aria-valuenow={Math.round(ratio)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
                </div>
              </Link>
            </article>
          );
        })}
      </section>
      {totalPages > 1 ? (
        <nav className="flex justify-center gap-3" aria-label="分页">
          {page > 1 ? (
            <Link
              className="rounded-2xl bg-white px-4 py-3 font-black text-navy shadow-soft"
              href={`/plan?page=${page - 1}`}
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
              href={`/plan?page=${page + 1}`}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
