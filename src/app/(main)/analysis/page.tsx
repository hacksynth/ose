import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserAnalysis } from '@/lib/analysis';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AIDiagnosisButton } from '@/components/ai-diagnosis-button';

function heat(status: string) {
  if (status === '危险') return 'bg-red-200 text-red-800';
  if (status === '薄弱') return 'bg-orange-200 text-orange-800';
  if (status === '一般') return 'bg-softYellow text-navy';
  if (status === '良好') return 'bg-softGreen text-green-800';
  return 'bg-gray-100 text-muted';
}

export default async function AnalysisPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;
  const pageUser = await prisma.user.findUnique({ where: { id: userId }, select: { targetExamDate: true } });
  const data = await getUserAnalysis(userId, pageUser?.targetExamDate);
  const maxCount = Math.max(1, ...data.trend.map((day) => day.count));
  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8 md:space-y-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Learning Analysis</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">学情诊断</h1>
        <p className="mt-3 font-semibold text-muted">
          用做题数据定位薄弱环节，生成更精准的复习策略。
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-softYellow p-6">
          <p className="font-black text-muted">综合掌握度</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data.overview.overallMastery}%
          </p>
        </Card>
        <Card className="bg-softBlue p-6">
          <p className="font-black text-muted">预测上午分</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data.overview.predictedAMScore}
            <span className="text-xl">/75</span>
          </p>
        </Card>
        <Card className="bg-softGreen p-6">
          <p className="font-black text-muted">已学习知识点</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data.overview.studiedKnowledgePoints}
            <span className="text-xl">/{data.overview.totalKnowledgePoints}</span>
          </p>
        </Card>
        <Card className="bg-softRose p-6">
          <p className="font-black text-muted">通过概率</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data.overview.passProbability}
          </p>
        </Card>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 hover:translate-y-0 sm:p-7">
          <h2 className="text-2xl font-black text-navy">知识点掌握热力图</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.knowledgePoints.map((kp) => (
              <details key={kp.id} className={`rounded-3xl p-4 ${heat(kp.status)}`}>
                <summary className="cursor-pointer font-black">
                  {kp.name} · {kp.mastery}%
                </summary>
                <div className="mt-3 space-y-2">
                  {kp.children?.map((child) => (
                    <div key={child.id} className="rounded-2xl bg-white/60 p-3 text-sm font-bold">
                      {child.name}：{child.mastery}% · {child.status}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>
        <Card className="p-5 hover:translate-y-0 sm:p-7">
          <h2 className="text-2xl font-black text-navy">薄弱环节 Top 5</h2>
          <div className="mt-5 space-y-3">
            {data.weakPoints.map((kp) => (
              <div
                key={kp.id}
                className="flex flex-col gap-3 rounded-3xl bg-warm p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-black text-navy">{kp.name}</p>
                  <p className="text-sm font-semibold text-muted">
                    掌握度 {kp.mastery}% · 做题 {kp.count} · 正确率 {kp.accuracy}% · 错题{' '}
                    {kp.wrongCount}
                  </p>
                </div>
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                  <Link href={`/knowledge/${kp.id}`}>去练习</Link>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </section>
      <Card className="p-5 hover:translate-y-0 sm:p-7">
        <h2 className="text-2xl font-black text-navy">最近 30 天趋势</h2>
        <div className="mt-6 flex h-44 items-end gap-1 overflow-x-auto pb-2">
          {data.trend.map((day) => (
            <div key={day.date} className="flex min-w-6 flex-col items-center gap-1">
              <div
                title={`${day.date}: ${day.count}题, ${day.accuracy}%`}
                className="w-5 rounded-t bg-primary"
                style={{
                  height: `${Math.max(4, (day.count / maxCount) * 130)}px`,
                  opacity: day.accuracy ? Math.max(0.25, day.accuracy / 100) : 0.2,
                }}
              />
              <span className="text-[10px] font-bold text-muted">{day.date.slice(8)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 hover:translate-y-0 sm:p-7">
        <h2 className="mb-5 text-2xl font-black text-navy">AI 诊断分析</h2>
        <AIDiagnosisButton />
      </Card>
    </main>
  );
}
