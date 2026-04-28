import Link from 'next/link';
import { ChevronRight, Layers3 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTopicAnswerStats, loadKnowledgeTree, rollupStats } from '@/lib/knowledge-stats';

type Status = '未学习' | '学习中' | '已掌握';
function statusClass(status: Status) {
  if (status === '已掌握') return 'bg-green-100 text-green-700';
  if (status === '学习中') return 'bg-primary-soft text-primary';
  return 'bg-gray-100 text-muted';
}
function deriveStatus(done: number, accuracy: number): Status {
  if (done === 0) return '未学习';
  return accuracy > 80 ? '已掌握' : '学习中';
}

export default async function KnowledgePage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [roots, topicStats, tree] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { questions: true } } },
        },
        _count: { select: { questions: true } },
      },
    }),
    userId ? getTopicAnswerStats(userId) : Promise.resolve(new Map()),
    loadKnowledgeTree(),
  ]);

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Knowledge Map</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">知识点体系</h1>
        <p className="mt-3 font-semibold text-muted">
          展开一级知识点，查看题量、正确率和掌握状态。
        </p>
      </section>
      <div className="space-y-4">
        {roots.map((root) => {
          const rootStat = rollupStats(tree.descendantsOf, topicStats, root.id);
          const rootStatus = deriveStatus(rootStat.total, rootStat.accuracy);
          const count =
            root._count.questions +
            root.children.reduce((sum, child) => sum + child._count.questions, 0);
          return (
            <details key={root.id} className="ose-card group p-4 sm:p-5" open>
              <summary className="flex cursor-pointer list-none flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Layers3 className="h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-navy sm:text-2xl">{root.name}</h2>
                    <p className="text-sm font-semibold text-muted sm:text-base">
                      {count} 道题 · 已做 {rootStat.total} · 正确率 {rootStat.accuracy}%
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-black sm:shrink-0 ${statusClass(rootStatus)}`}
                >
                  {rootStatus}
                </span>
              </summary>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {root.children.map((child) => {
                  const childStat = rollupStats(tree.descendantsOf, topicStats, child.id);
                  const childStatus = deriveStatus(childStat.total, childStat.accuracy);
                  return (
                    <Link
                      key={child.id}
                      href={`/knowledge/${child.id}`}
                      className="rounded-3xl bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-navy">{child.name}</h3>
                          <p className="mt-1 text-sm font-semibold text-muted">
                            {child._count.questions} 道题 · 已做 {childStat.total}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-primary" />
                      </div>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100"
                        role="progressbar"
                        aria-valuenow={childStat.accuracy}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${child.name} 正确率 ${childStat.accuracy}%`}
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${childStat.accuracy}%` }}
                        />
                      </div>
                      <span
                        className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClass(childStatus)}`}
                      >
                        {childStatus}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}
