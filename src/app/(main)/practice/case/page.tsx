import Link from 'next/link';
import { ClipboardPenLine } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export default async function CasePracticePage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [cases, answeredSubIds] = await Promise.all([
    prisma.question.findMany({
      where: { type: 'CASE_ANALYSIS' },
      orderBy: { questionNumber: 'asc' },
      select: {
        id: true,
        content: true,
        questionNumber: true,
        difficulty: true,
        knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
        caseScenario: { select: { subQuestions: { select: { id: true } } } },
      },
    }),
    userId
      ? prisma.userCaseAnswer.findMany({ where: { userId }, select: { caseSubQuestionId: true } })
      : Promise.resolve([] as Array<{ caseSubQuestionId: string }>),
  ]);
  const answered = new Set(answeredSubIds.map((row) => row.caseSubQuestionId));

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <p className="mb-3 text-sm font-black text-primary">Case Analysis</p>
        <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">案例分析练习</h1>
        <p className="mt-3 font-semibold text-muted">
          覆盖下午题常见的数据流图、数据库、UML、算法和设计模式。
        </p>
      </section>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cases.map((item) => {
          const isAnswered =
            item.caseScenario?.subQuestions.some((sub) => answered.has(sub.id)) ?? false;
          return (
            <Link
              key={item.id}
              href={`/practice/case/${item.id}`}
              className="ose-card block bg-[#E9D5FF]/70 p-6"
            >
              <ClipboardPenLine className="h-10 w-10 text-primary" />
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-primary">
                  第 {item.questionNumber} 题
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-navy">
                  {item.knowledgePoint.name}
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-muted">
                  难度 {item.difficulty}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-black text-navy">{item.content}</h2>
              <p className="mt-3 font-semibold text-muted">
                {isAnswered ? '已作答，可继续查看或重做' : '未作答'}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
