import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PlanDayToggle } from '@/components/plan-day-toggle';
import { PlanDeleteButton } from '@/components/plan-delete-button';

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await params;
  const plan = await prisma.studyPlan.findFirst({
    where: { id, userId: session.user.id },
    include: { days: { orderBy: { dayNumber: 'asc' } } },
  });
  if (!plan) notFound();
  const completed = plan.days.filter((day) => day.completed).length;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Plan Detail</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl">{plan.title}</h1>
        <p className="mt-3 font-semibold text-muted">
          目标 {plan.targetExamDate.toISOString().slice(0, 10)} · 共 {plan.totalDays} 天 · 完成{' '}
          {Math.round((completed / Math.max(1, plan.days.length)) * 100)}%
        </p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(completed / Math.max(1, plan.days.length)) * 100}%` }}
          />
        </div>
      </section>
      <Card className="p-5 hover:translate-y-0 sm:p-7">
        <MarkdownRenderer content={plan.content} />
      </Card>
      <section className="grid gap-4 md:grid-cols-2">
        {plan.days.map((day) => {
          const dateKey = day.date.toISOString().slice(0, 10);
          const tasks = Array.isArray(day.tasks) ? (day.tasks as string[]) : [];
          return (
            <Card
              key={day.id}
              className={`p-5 hover:translate-y-0 ${dateKey === today ? 'bg-softYellow' : ''}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-black text-navy">
                  第 {day.dayNumber} 天 · {dateKey}
                </h2>
                <PlanDayToggle
                  planId={plan.id}
                  dayNumber={day.dayNumber}
                  initialCompleted={day.completed}
                />
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 font-semibold text-muted">
                {tasks.map((task, index) => (
                  <li key={index}>{task}</li>
                ))}
              </ul>
            </Card>
          );
        })}
      </section>
      <section className="flex justify-end rounded-[1.5rem] bg-white/80 p-5 shadow-soft sm:rounded-[2rem]">
        <PlanDeleteButton planId={plan.id} afterDelete="redirect" />
      </section>
    </main>
  );
}
