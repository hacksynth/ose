import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getChoiceAnswerEvents } from '@/lib/knowledge-stats';
import {
  getChinaDateKey,
  getContinuousDays,
  getLongestStreak,
  getRecentDateKeys,
} from '@/lib/stats';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ProfileForms } from '@/components/profile-forms';
import { AISettingsCard } from '@/components/ai-settings-card';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function heatClass(count: number) {
  if (count === 0) return 'bg-gray-100';
  if (count <= 5) return 'bg-primary/25';
  if (count <= 15) return 'bg-primary/60';
  return 'bg-primary';
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [user, answers, roots] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, targetExamDate: true, createdAt: true },
    }),
    getChoiceAnswerEvents(session.user.id),
    prisma.knowledgePoint.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: { children: { select: { id: true } } },
    }),
  ]);
  if (!user) redirect('/login');

  const total = answers.length;
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const dates = answers.map((answer) => answer.createdAt);
  const dateKeys = getRecentDateKeys(90);
  const heatMap = new Map(dateKeys.map((key) => [key, 0]));
  answers.forEach((answer) => {
    const key = getChinaDateKey(answer.createdAt);
    if (heatMap.has(key)) heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
  });
  const knowledgeStats = roots.map((root) => {
    const childIds = root.children.map((child) => child.id);
    const rows = answers.filter(
      (answer) =>
        answer.knowledgePointId === root.id ||
        answer.parentId === root.id ||
        childIds.includes(answer.knowledgePointId)
    );
    const right = rows.filter((answer) => answer.isCorrect).length;
    return {
      id: root.id,
      name: root.name,
      total: rows.length,
      accuracy: rows.length ? Math.round((right / rows.length) * 100) : 0,
    };
  });

  return (
    <main className="mx-auto mt-8 max-w-7xl space-y-8">
      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="bg-white/90 p-8">
          <div className="flex items-center gap-5">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-3xl">
                {user.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-black text-primary">Profile</p>
              <h1 className="text-4xl font-black text-navy">{user.name}</h1>
              <p className="mt-1 font-semibold text-muted">{user.email}</p>
              <p className="mt-2 text-sm font-bold text-muted">
                注册于 {formatDate(user.createdAt)}
              </p>
            </div>
          </div>
        </Card>
        <div className="space-y-5">
          <ProfileForms
            initialName={user.name}
            initialTargetExamDate={user.targetExamDate?.toISOString().slice(0, 10) ?? null}
          />
          <AISettingsCard />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="bg-softYellow p-6">
          <p className="font-black text-muted">累计做题</p>
          <p className="mt-3 text-5xl font-black text-navy">{total}</p>
        </Card>
        <Card className="bg-softBlue p-6">
          <p className="font-black text-muted">累计正确率</p>
          <p className="mt-3 text-5xl font-black text-navy">
            {total ? Math.round((correct / total) * 100) : 0}%
          </p>
        </Card>
        <Card className="bg-softGreen p-6">
          <p className="font-black text-muted">累计学习天数</p>
          <p className="mt-3 text-5xl font-black text-navy">
            {new Set(dates.map(getChinaDateKey)).size}
          </p>
        </Card>
        <Card className="bg-softRose p-6">
          <p className="font-black text-muted">最长连续学习</p>
          <p className="mt-3 text-5xl font-black text-navy">{getLongestStreak(dates)}天</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-7 hover:translate-y-0">
          <h2 className="text-2xl font-black text-navy">知识点掌握</h2>
          <div className="mt-6 space-y-4">
            {knowledgeStats.map((item) => (
              <div key={item.id}>
                <div className="mb-2 flex justify-between text-sm font-black">
                  <span>
                    {item.name} · {item.total} 题
                  </span>
                  <span>{item.accuracy}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-orange-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${item.accuracy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-7 hover:translate-y-0">
          <h2 className="text-2xl font-black text-navy">最近 90 天学习热力图</h2>
          <div className="mt-6 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2">
            {dateKeys.map((date) => {
              const count = heatMap.get(date) ?? 0;
              return (
                <div
                  key={date}
                  title={`${date}：${count} 题`}
                  className={`h-4 w-4 rounded ${heatClass(count)}`}
                />
              );
            })}
          </div>
          <p className="mt-4 text-sm font-semibold text-muted">颜色越深，表示当天做题越多。</p>
        </Card>
      </section>
    </main>
  );
}
