import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getDescendantTopicIds } from '@/lib/knowledge-stats';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StartPracticeButton } from '@/components/start-practice-button';

export default async function TopicPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = await prisma.knowledgePoint.findUnique({
    where: { id },
    include: { children: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!topic) notFound();

  const topicIds = await getDescendantTopicIds(id);
  const questions = await prisma.question.findMany({
    where: { knowledgePointId: { in: topicIds } },
    orderBy: [{ year: 'desc' }, { questionNumber: 'asc' }],
    select: {
      id: true,
      content: true,
      questionNumber: true,
      knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
    },
  });

  return (
    <main className="mx-auto mt-6 max-w-6xl space-y-6 md:mt-8">
      <Button asChild variant="secondary">
        <Link href="/practice">
          <ArrowLeft className="h-4 w-4" />
          返回练习入口
        </Link>
      </Button>
      <Card className="p-5 sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Topic Practice</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl">{topic.name}</h1>
        <p className="mt-3 font-semibold text-muted">
          共 {questions.length} 道题，覆盖 {topic.children.length || 1} 个子知识点。
        </p>
        <div className="mt-6">
          <StartPracticeButton
            payload={{ mode: 'topic', topicId: id, limit: questions.length || 20 }}
          >
            开始本知识点练习
          </StartPracticeButton>
        </div>
      </Card>
      <div className="grid gap-4">
        {questions.map((question) => (
          <Card key={question.id} className="p-5 hover:translate-y-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-black text-muted">
                  2023 上午 · 第 {question.questionNumber} 题 ·{' '}
                  {question.knowledgePoint.parent?.name ?? question.knowledgePoint.name} /{' '}
                  {question.knowledgePoint.name}
                </p>
                <h2 className="text-lg font-black leading-relaxed text-navy">{question.content}</h2>
              </div>
              <FileQuestion className="h-7 w-7 shrink-0 text-primary" />
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
