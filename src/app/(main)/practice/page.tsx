import Link from 'next/link';
import {
  BookOpenCheck,
  ClipboardPenLine,
  Layers3,
  Shuffle,
  ListOrdered,
  Sparkles,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StartPracticeButton } from '@/components/start-practice-button';
import { getTopicAnswerStats, loadKnowledgeTree, rollupStats } from '@/lib/knowledge-stats';

const colorClasses = ['bg-softYellow', 'bg-softBlue', 'bg-softRose', 'bg-softGreen'];

export default async function PracticePage() {
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
      },
    }),
    userId ? getTopicAnswerStats(userId) : Promise.resolve(new Map()),
    loadKnowledgeTree(),
  ]);

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8 md:space-y-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Practice Center</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">
          选择今天的练习方式
        </h1>
        <p className="mt-4 max-w-2xl font-semibold text-muted">
          按知识点查漏补缺，或用随机/顺序练习保持手感。
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-gradient-to-br from-primary/90 to-purple-500 p-6 text-white sm:p-7">
            <Sparkles className="h-10 w-10" />
            <h2 className="mt-5 text-2xl font-black">AI 智能出题</h2>
            <p className="mt-2 font-semibold text-white/80">让 AI 为你量身出题，强化薄弱知识点。</p>
            <div className="mt-6">
              <Button asChild variant="secondary">
                <Link href="/practice/ai-generate">进入 AI 出题</Link>
              </Button>
            </div>
          </Card>
          <Card className="bg-softBlue p-6 sm:p-7">
            <Shuffle className="h-10 w-10 text-primary" />
            <h2 className="mt-5 text-2xl font-black text-navy">随机练习</h2>
            <p className="mt-2 font-semibold text-muted">从题库随机抽取 20 题，适合快速热身。</p>
            <div className="mt-6">
              <StartPracticeButton payload={{ mode: 'random', limit: 20 }}>
                开始随机练习
              </StartPracticeButton>
            </div>
          </Card>
          <Card className="bg-softGreen p-6 sm:p-7">
            <ListOrdered className="h-10 w-10 text-primary" />
            <h2 className="mt-5 text-2xl font-black text-navy">顺序练习</h2>
            <p className="mt-2 font-semibold text-muted">按年份和题号顺序推进，适合系统训练。</p>
            <div className="mt-6">
              <StartPracticeButton payload={{ mode: 'sequential', limit: 20 }} variant="secondary">
                开始顺序练习
              </StartPracticeButton>
            </div>
          </Card>
          <Card className="bg-[#E9D5FF]/70 p-6 sm:p-7">
            <ClipboardPenLine className="h-10 w-10 text-primary" />
            <h2 className="mt-5 text-2xl font-black text-navy">案例分析练习</h2>
            <p className="mt-2 font-semibold text-muted">
              训练下午题：数据流图、数据库、UML、算法和设计模式。
            </p>
            <div className="mt-6">
              <Button asChild variant="secondary">
                <Link href="/practice/case">进入案例题</Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <Layers3 className="h-7 w-7 text-primary" />
          <h2 className="text-2xl font-black text-navy sm:text-3xl">按知识点练习</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {roots.map((root, index) => {
            const stat = rollupStats(tree.descendantsOf, topicStats, root.id);
            const count = root.children.reduce((sum, child) => sum + child._count.questions, 0);
            return (
              <Link
                href={`/practice/topic/${root.id}`}
                key={root.id}
                className={`ose-card block p-5 sm:p-6 ${colorClasses[index % colorClasses.length]}`}
              >
                <BookOpenCheck className="h-9 w-9 text-primary" />
                <h3 className="mt-5 text-2xl font-black text-navy">{root.name}</h3>
                <p className="mt-2 text-sm font-bold text-muted">
                  {root.children
                    .map((child) => child.name)
                    .slice(0, 4)
                    .join(' · ')}
                </p>
                <div className="mt-6 grid grid-cols-3 gap-2 text-center sm:gap-3">
                  <span className="rounded-2xl bg-white/70 p-2 sm:p-3">
                    <b className="block text-lg text-navy sm:text-xl">{count}</b>
                    <small className="font-bold text-muted">题目</small>
                  </span>
                  <span className="rounded-2xl bg-white/70 p-2 sm:p-3">
                    <b className="block text-lg text-navy sm:text-xl">{stat.total}</b>
                    <small className="font-bold text-muted">已做</small>
                  </span>
                  <span className="rounded-2xl bg-white/70 p-2 sm:p-3">
                    <b className="block text-lg text-navy sm:text-xl">{stat.accuracy}%</b>
                    <small className="font-bold text-muted">正确率</small>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
