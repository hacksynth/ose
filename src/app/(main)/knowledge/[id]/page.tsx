import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpenCheck, ClipboardPenLine } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getChoiceAnswerEvents, getDescendantTopicIds } from '@/lib/knowledge-stats';
import { auth } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StartPracticeButton } from '@/components/start-practice-button';

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  const topic = await prisma.knowledgePoint.findUnique({
    where: { id },
    include: { parent: true, children: true },
  });
  if (!topic) notFound();
  const ids = await getDescendantTopicIds(id);
  const [questions, answerEvents, wrongCount] = await Promise.all([
    prisma.question.findMany({
      where: { knowledgePointId: { in: ids } },
      orderBy: [{ type: 'asc' }, { questionNumber: 'asc' }],
      select: { id: true, type: true, content: true, questionNumber: true },
    }),
    userId ? getChoiceAnswerEvents(userId) : Promise.resolve([]),
    userId
      ? prisma.wrongNote.count({ where: { userId, question: { knowledgePointId: { in: ids } } } })
      : 0,
  ]);
  const topicAnswerEvents = answerEvents.filter((answer) => ids.includes(answer.knowledgePointId));
  const answerTotal = topicAnswerEvents.length;
  const answerCorrect = topicAnswerEvents.filter((answer) => answer.isCorrect).length;
  const choices = questions.filter((q) => q.type === 'CHOICE');
  const cases = questions.filter((q) => q.type === 'CASE_ANALYSIS');
  const accuracy = answerTotal ? Math.round((answerCorrect / answerTotal) * 100) : 0;
  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <Button asChild variant="secondary">
        <Link href="/knowledge">
          <ArrowLeft className="h-4 w-4" />
          返回知识点
        </Link>
      </Button>
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">{topic.parent?.name ?? '一级知识点'}</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">{topic.name}</h1>
        <p className="mt-3 font-semibold text-muted">
          {topic.description ?? '软考软件设计师核心考点'}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="bg-softYellow p-5">
            <p className="font-black text-muted">做题数</p>
            <p className="mt-2 text-4xl font-black">{answerTotal}</p>
          </Card>
          <Card className="bg-softBlue p-5">
            <p className="font-black text-muted">正确率</p>
            <p className="mt-2 text-4xl font-black">{accuracy}%</p>
          </Card>
          <Card className="bg-softRose p-5">
            <p className="font-black text-muted">错题数</p>
            <p className="mt-2 text-4xl font-black">{wrongCount}</p>
          </Card>
        </div>
        <div className="mt-6">
          <StartPracticeButton
            payload={{ mode: 'topic', topicId: id, limit: choices.length || 20 }}
            className="w-full sm:w-auto"
          >
            练习本知识点
          </StartPracticeButton>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 hover:translate-y-0">
          <h2 className="mb-5 flex items-center gap-2 text-2xl font-black text-navy">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            选择题
          </h2>
          <div className="space-y-3">
            {choices.map((q) => (
              <Link
                key={q.id}
                href={`/practice/topic/${id}`}
                className="block rounded-2xl bg-warm p-4 font-bold text-navy hover:bg-primary-soft"
              >
                2023 上午 第 {q.questionNumber} 题 · {q.content}
              </Link>
            ))}
            {!choices.length ? <p className="font-semibold text-muted">暂无选择题</p> : null}
          </div>
        </Card>
        <Card className="p-6 hover:translate-y-0">
          <h2 className="mb-5 flex items-center gap-2 text-2xl font-black text-navy">
            <ClipboardPenLine className="h-6 w-6 text-primary" />
            案例分析题
          </h2>
          <div className="space-y-3">
            {cases.map((q) => (
              <Link
                key={q.id}
                href={`/practice/case/${q.id}`}
                className="block rounded-2xl bg-warm p-4 font-bold text-navy hover:bg-primary-soft"
              >
                2023 下午 第 {q.questionNumber} 题 · {q.content}
              </Link>
            ))}
            {!cases.length ? <p className="font-semibold text-muted">暂无案例题</p> : null}
          </div>
        </Card>
      </section>
    </main>
  );
}
