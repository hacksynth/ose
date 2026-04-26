import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookOpenCheck,
  Brain,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPenLine,
  Clock3,
  FileQuestion,
  NotebookPen,
  ScrollText,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getChinaDateKey,
  getContinuousDays,
  getNextExamCountdown,
  getRecentDateKeys,
  getTodayRange,
} from '@/lib/stats';
import { loadKnowledgeTree, rollupStats, getTopicAnswerStats } from '@/lib/knowledge-stats';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CASE_PASS_RATIO,
  RECENT_ANSWERS_COUNT,
  RECENT_TREND_DAYS_DASHBOARD,
  WEAK_TOPICS_LIMIT,
} from '@/lib/constants';

function formatChinaDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getCountdownToDate(date: Date) {
  const todayKey = getChinaDateKey(new Date());
  const targetKey = getChinaDateKey(date);
  const todayMs = new Date(`${todayKey}T00:00:00+08:00`).getTime();
  const targetMs = new Date(`${targetKey}T00:00:00+08:00`).getTime();
  return Math.max(0, Math.round((targetMs - todayMs) / 86_400_000));
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const todayRange = getTodayRange();
  const defaultExam = getNextExamCountdown();
  const trendKeys = getRecentDateKeys(RECENT_TREND_DAYS_DASHBOARD);
  const trendStart = new Date(`${trendKeys[0]}T00:00:00+08:00`);

  const [
    user,
    choiceCount,
    choiceCorrect,
    caseAnswerBuckets,
    todayChoiceAnswers,
    todayCaseAnswers,
    unmasteredWrong,
    recentAnswers,
    roots,
    recentExam,
    activePlan,
    aiQuestionCount,
    trendAnswers,
    streakDates,
    topicStats,
    tree,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { targetExamDate: true } }),
    prisma.userAnswer.count({ where: { userId } }),
    prisma.userAnswer.count({ where: { userId, isCorrect: true } }),
    prisma.userCaseAnswer.findMany({
      where: { userId },
      select: { score: true, createdAt: true, caseSubQuestion: { select: { score: true } } },
    }),
    prisma.userAnswer.count({
      where: { userId, createdAt: { gte: todayRange.start, lte: todayRange.end } },
    }),
    prisma.userCaseAnswer.count({
      where: { userId, createdAt: { gte: todayRange.start, lte: todayRange.end } },
    }),
    prisma.wrongNote.count({ where: { userId, markedMastered: false } }),
    prisma.userAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ANSWERS_COUNT,
      select: {
        id: true,
        isCorrect: true,
        createdAt: true,
        question: {
          select: {
            knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.knowledgePoint.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.examAttempt.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
      include: { exam: { select: { title: true, totalScore: true } } },
    }),
    prisma.studyPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { days: { orderBy: { dayNumber: 'asc' } } },
    }),
    prisma.question.count({ where: { isAIGenerated: true } }),
    prisma.userAnswer.findMany({
      where: { userId, createdAt: { gte: trendStart } },
      select: { isCorrect: true, createdAt: true },
    }),
    prisma.userAnswer.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 365,
    }),
    getTopicAnswerStats(userId),
    loadKnowledgeTree(),
  ]);
  const exam = user?.targetExamDate
    ? { date: user.targetExamDate, days: getCountdownToDate(user.targetExamDate), custom: true }
    : { ...defaultExam, custom: false };

  const caseTotal = caseAnswerBuckets.length;
  const caseCorrect = caseAnswerBuckets.filter(
    (row) => (row.score ?? 0) >= row.caseSubQuestion.score * CASE_PASS_RATIO
  ).length;
  const totalAnswers = choiceCount + caseTotal;
  const correctAnswers = choiceCorrect + caseCorrect;
  const accuracy = totalAnswers === 0 ? 0 : Math.round((correctAnswers / totalAnswers) * 100);
  const streakSource = [
    ...streakDates.map((row) => row.createdAt),
    ...caseAnswerBuckets.map((row) => row.createdAt),
  ];
  const streakDays = getContinuousDays(streakSource);

  const trendBuckets = new Map<string, { count: number; correct: number }>();
  for (const row of trendAnswers) {
    const key = getChinaDateKey(row.createdAt);
    const bucket = trendBuckets.get(key) ?? { count: 0, correct: 0 };
    bucket.count += 1;
    if (row.isCorrect) bucket.correct += 1;
    trendBuckets.set(key, bucket);
  }
  const trend = trendKeys.map((date) => {
    const bucket = trendBuckets.get(date) ?? { count: 0, correct: 0 };
    return {
      date: date.slice(5),
      count: bucket.count,
      accuracy: bucket.count ? Math.round((bucket.correct / bucket.count) * 100) : 0,
    };
  });
  const maxTrendCount = Math.max(1, ...trend.map((item) => item.count));

  const weakTopics = roots
    .map((root) => {
      const stat = rollupStats(tree.descendantsOf, topicStats, root.id);
      return {
        id: root.id,
        name: root.name,
        total: stat.total,
        accuracy: stat.total ? stat.accuracy : 100,
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, WEAK_TOPICS_LIMIT);

  const stats = [
    {
      label: '做题总数',
      value: totalAnswers,
      unit: '题',
      icon: FileQuestion,
      className: 'bg-softYellow',
    },
    { label: '正确率', value: accuracy, unit: '%', icon: Target, className: 'bg-softBlue' },
    {
      label: '连续学习',
      value: streakDays,
      unit: '天',
      icon: TrendingUp,
      className: 'bg-softGreen',
    },
    {
      label: aiQuestionCount ? 'AI 出题' : '今日做题',
      value: aiQuestionCount || todayChoiceAnswers + todayCaseAnswers,
      unit: '题',
      icon: aiQuestionCount ? Sparkles : CalendarCheck,
      className: 'bg-softRose',
    },
  ];

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTasks = (
    (activePlan?.days.find((day) => day.date.toISOString().slice(0, 10) === todayKey)?.tasks as
      | string[]
      | undefined) ??
    (activePlan?.days[0]?.tasks as string[] | undefined) ??
    []
  ).slice(0, 4);

  return (
    <main className="mx-auto mt-8 max-w-7xl space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[2rem] bg-white/90 p-8 shadow-soft backdrop-blur md:p-10">
          <p className="mb-4 inline-flex rounded-full bg-primary-soft px-4 py-2 text-sm font-black text-primary">
            今天也很适合进步一点点
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-navy md:text-6xl">
            欢迎回来，{session.user.name || '学习伙伴'}
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-semibold text-muted">
            {formatChinaDate(new Date())} ·{' '}
            {exam.custom ? '你的目标考试时间是' : '最近一次软考约在'} {formatChinaDate(exam.date)}
            ，还有 <span className="font-black text-primary">{exam.days}</span> 天
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/practice">
                <BookOpenCheck className="h-5 w-5" />
                开始练习
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/wrong-notes">
                <NotebookPen className="h-5 w-5" />
                查看错题（{unmasteredWrong}）
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/profile">
                <UserRound className="h-5 w-5" />
                个人中心
              </Link>
            </Button>
          </div>
        </div>
        <Card className="flex flex-col justify-between bg-navy p-8 text-white hover:translate-y-0">
          <div>
            <p className="text-sm font-black text-white/60">考试倒计时</p>
            <h2 className="mt-3 text-5xl font-black">
              {exam.days}
              <span className="ml-2 text-xl">天</span>
            </h2>
          </div>
          <div className="mt-8 rounded-[1.25rem] bg-white/10 p-5">
            <Clock3 className="mb-4 h-8 w-8 text-softYellow" />
            <p className="font-bold text-white/80">保持每天 20 题，错题复盘比盲目刷题更重要。</p>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={`p-6 ${stat.className}`}>
              <div className="flex items-center justify-between">
                <p className="font-black text-muted">{stat.label}</p>
                <span className="rounded-2xl bg-white/70 p-3">
                  <Icon className="h-5 w-5 text-navy" />
                </span>
              </div>
              <p className="mt-6 text-5xl font-black text-navy">
                {stat.value}
                <span className="ml-1 text-xl">{stat.unit}</span>
              </p>
            </Card>
          );
        })}
      </section>

      {activePlan ? (
        <Card className="bg-softYellow p-7 hover:translate-y-0">
          <h2 className="text-2xl font-black text-navy">今日任务</h2>
          <p className="mt-2 font-semibold text-muted">来自学习计划：{activePlan.title}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 font-bold text-navy">
            {todayTasks.map((task, index) => (
              <li key={index}>{task}</li>
            ))}
          </ul>
          <Button asChild className="mt-5">
            <Link href={`/plan/${activePlan.id}`}>查看计划</Link>
          </Button>
        </Card>
      ) : null}

      <Card className="bg-white/90 p-7 hover:translate-y-0">
        <h2 className="text-2xl font-black text-navy">综合掌握度</h2>
        <p className="mt-4 text-5xl font-black text-primary">{accuracy}%</p>
        <Button asChild variant="secondary" className="mt-5">
          <Link href="/analysis">
            <Brain className="h-4 w-4" />
            进入诊断
          </Link>
        </Button>
      </Card>

      {recentExam ? (
        <Card className="bg-white/90 p-7 hover:translate-y-0">
          <h2 className="text-2xl font-black text-navy">最近考试成绩</h2>
          <p className="mt-3 font-semibold text-muted">{recentExam.exam.title}</p>
          <p className="mt-4 text-5xl font-black text-primary">
            {recentExam.totalScore}
            <span className="text-xl text-muted">/{recentExam.exam.totalScore}</span>
          </p>
          <Button asChild className="mt-5">
            <Link href={`/exam/${recentExam.id}/result`}>查看报告</Link>
          </Button>
        </Card>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="p-7 hover:translate-y-0">
          <h2 className="mb-5 text-2xl font-black text-navy">最近做题记录</h2>
          {recentAnswers.length ? (
            <div className="space-y-3">
              {recentAnswers.map((answer) => (
                <div
                  key={answer.id}
                  className="flex items-center justify-between rounded-2xl bg-warm p-3"
                >
                  <div>
                    <p className="font-black text-navy">
                      {answer.question.knowledgePoint.parent?.name ??
                        answer.question.knowledgePoint.name}{' '}
                      · {answer.question.knowledgePoint.name}
                    </p>
                    <p className="text-sm font-semibold text-muted">
                      {formatShortTime(answer.createdAt)}
                    </p>
                  </div>
                  {answer.isCorrect ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" aria-label="答对" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" aria-label="答错" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="font-semibold text-muted">还没有做题记录，先开始第一组练习吧。</p>
          )}
        </Card>
        <Card className="p-7 hover:translate-y-0">
          <h2 className="mb-5 flex items-center gap-2 text-2xl font-black text-navy">
            <TrendingDown className="h-6 w-6 text-primary" />
            薄弱知识点 Top 5
          </h2>
          {weakTopics.length ? (
            <div className="space-y-4">
              {weakTopics.map((topic) => (
                <div key={topic.id}>
                  <div className="mb-2 flex justify-between text-sm font-black">
                    <span>
                      {topic.name} · {topic.total} 题
                    </span>
                    <span>{topic.accuracy}%</span>
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full bg-orange-100"
                    role="progressbar"
                    aria-valuenow={topic.accuracy}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${topic.name} 正确率 ${topic.accuracy}%`}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${topic.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-semibold text-muted">完成一些练习后会显示薄弱知识点。</p>
          )}
        </Card>
        <Card className="p-7 hover:translate-y-0">
          <h2 className="mb-5 text-2xl font-black text-navy">7 天学习趋势</h2>
          <div className="flex h-40 items-end gap-3">
            {trend.map((item) => (
              <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex w-full items-end justify-center rounded-t-2xl bg-primary/20"
                  style={{ height: `${Math.max(8, (item.count / maxTrendCount) * 120)}px` }}
                >
                  <div
                    className="w-full rounded-t-2xl bg-primary"
                    style={{ height: `${item.accuracy || 10}%` }}
                  />
                </div>
                <span className="text-xs font-black text-muted">{item.date}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-muted">
            柱高表示做题量，深色高度表示正确率。
          </p>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/practice/ai-generate"
          className="ose-card group block bg-gradient-to-br from-softYellow to-softRose p-7"
        >
          <Sparkles className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">AI 出题</h3>
          <p className="mt-3 font-semibold text-muted">让 AI 为你量身生成练习题。</p>
        </Link>
        <Link href="/practice" className="ose-card group block p-7">
          <BookOpenCheck className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">开始练习</h3>
          <p className="mt-3 font-semibold text-muted">按知识点刷题，快速定位薄弱环节。</p>
        </Link>
        <Link href="/wrong-notes" className="ose-card group block p-7">
          <ClipboardCheck className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">查看错题</h3>
          <p className="mt-3 font-semibold text-muted">当前未掌握错题 {unmasteredWrong} 道。</p>
        </Link>
        <Link href="/analysis" className="ose-card group block p-7">
          <Brain className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">学情诊断</h3>
          <p className="mt-3 font-semibold text-muted">定位薄弱知识点和通过概率。</p>
        </Link>
        <Link href="/plan" className="ose-card group block p-7">
          <CalendarCheck className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">学习计划</h3>
          <p className="mt-3 font-semibold text-muted">生成每日备考任务。</p>
        </Link>
        <Link href="/exam" className="ose-card group block p-7">
          <ScrollText className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">模拟考试</h3>
          <p className="mt-3 font-semibold text-muted">限时完成整套模拟卷。</p>
        </Link>
        <Link href="/practice/case" className="ose-card group block p-7">
          <ClipboardPenLine className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">案例分析</h3>
          <p className="mt-3 font-semibold text-muted">训练软件设计师下午题。</p>
        </Link>
        <Link href="/profile" className="ose-card group block p-7">
          <UserRound className="h-10 w-10 text-primary" />
          <h3 className="mt-6 text-2xl font-black text-navy">个人中心</h3>
          <p className="mt-3 font-semibold text-muted">查看学习热力图和知识点掌握情况。</p>
        </Link>
      </section>
    </main>
  );
}
