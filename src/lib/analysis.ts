import { prisma } from '@/lib/prisma';
import {
  getChinaDateKey,
  getContinuousDays,
  getNextExamCountdown,
  getRecentDateKeys,
} from '@/lib/stats';
import { getChoiceAnswerEvents, loadKnowledgeTree } from '@/lib/knowledge-stats';
import {
  MEDIUM_MASTERY_THRESHOLD,
  PASS_MASTERY_THRESHOLD,
  RECENT_TREND_DAYS_ANALYSIS,
  WEAK_TOPICS_LIMIT,
} from '@/lib/constants';

export type KnowledgeAnalysis = {
  id: string;
  name: string;
  count: number;
  correct: number;
  accuracy: number;
  wrongCount: number;
  avgTime: number;
  recentAccuracy: number;
  mastery: number;
  status: '危险' | '薄弱' | '一般' | '良好' | '未学习';
  children?: KnowledgeAnalysis[];
};

function statusByMastery(mastery: number, count: number): KnowledgeAnalysis['status'] {
  if (count === 0) return '未学习';
  if (mastery < 40) return '危险';
  if (mastery < 60) return '薄弱';
  if (mastery < 80) return '一般';
  return '良好';
}

function calcMastery(count: number, accuracy: number, recentAccuracy: number) {
  let mastery = accuracy;
  if (count < 3) mastery *= 0.7;
  if (recentAccuracy > accuracy) mastery += Math.min(10, (recentAccuracy - accuracy) * 0.2);
  return Math.max(0, Math.min(100, Math.round(mastery)));
}

type PerKpStat = {
  count: number;
  correct: number;
  wrongCount: number;
  totalTime: number;
  recentTotal: number;
  recentCorrect: number;
};

function emptyStat(): PerKpStat {
  return { count: 0, correct: 0, wrongCount: 0, totalTime: 0, recentTotal: 0, recentCorrect: 0 };
}

function merge(a: PerKpStat, b: PerKpStat): PerKpStat {
  return {
    count: a.count + b.count,
    correct: a.correct + b.correct,
    wrongCount: a.wrongCount + b.wrongCount,
    totalTime: a.totalTime + b.totalTime,
    recentTotal: a.recentTotal + b.recentTotal,
    recentCorrect: a.recentCorrect + b.recentCorrect,
  };
}

function rollup(
  descendantsOf: (id: string) => string[],
  perKp: Map<string, PerKpStat>,
  rootId: string
) {
  let stat = emptyStat();
  for (const id of descendantsOf(rootId)) {
    const bucket = perKp.get(id);
    if (bucket) stat = merge(stat, bucket);
  }
  return stat;
}

function toAnalysis(
  id: string,
  name: string,
  stat: PerKpStat
): Omit<KnowledgeAnalysis, 'children'> {
  const accuracy = stat.count === 0 ? 0 : Math.round((stat.correct / stat.count) * 100);
  const recentAccuracy =
    stat.recentTotal === 0 ? accuracy : Math.round((stat.recentCorrect / stat.recentTotal) * 100);
  const avgTime = stat.count === 0 ? 0 : Math.round(stat.totalTime / stat.count);
  const mastery = calcMastery(stat.count, accuracy, recentAccuracy);
  return {
    id,
    name,
    count: stat.count,
    correct: stat.correct,
    accuracy,
    wrongCount: stat.wrongCount,
    avgTime,
    recentAccuracy,
    mastery,
    status: statusByMastery(mastery, stat.count),
  };
}

export async function getUserAnalysis(userId: string, targetExamDate?: Date | null) {
  const trendKeys = getRecentDateKeys(RECENT_TREND_DAYS_ANALYSIS);
  const recent7Keys = new Set(trendKeys.slice(-7));

  const [roots, answerRows, wrongRows, totalKnowledgePoints, tree] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: { children: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } } },
    }),
    getChoiceAnswerEvents(userId),
    prisma.wrongNote.groupBy({
      by: ['questionId'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.knowledgePoint.count(),
    loadKnowledgeTree(),
  ]);

  const wrongQuestionIds = wrongRows.map((row) => row.questionId);
  const wrongQuestionKps = wrongQuestionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: wrongQuestionIds } },
        select: { id: true, knowledgePointId: true },
      })
    : [];
  const kpByQuestion = new Map(
    wrongQuestionKps.map((question) => [question.id, question.knowledgePointId])
  );

  const perKp = new Map<string, PerKpStat>();
  const getBucket = (id: string) => {
    const existing = perKp.get(id);
    if (existing) return existing;
    const created = emptyStat();
    perKp.set(id, created);
    return created;
  };

  const answerCountByDate = new Map<string, { count: number; correct: number }>();
  const studyDaysSet = new Set<string>();
  const last5ByKp = new Map<string, boolean[]>();

  for (const row of answerRows) {
    const kpId = row.knowledgePointId;
    const bucket = getBucket(kpId);
    bucket.count += 1;
    if (row.isCorrect) bucket.correct += 1;
    bucket.totalTime += row.timeSpent;

    const dateKey = getChinaDateKey(row.createdAt);
    if (trendKeys.includes(dateKey)) studyDaysSet.add(dateKey);
    const dayBucket = answerCountByDate.get(dateKey) ?? { count: 0, correct: 0 };
    dayBucket.count += 1;
    if (row.isCorrect) dayBucket.correct += 1;
    answerCountByDate.set(dateKey, dayBucket);

    const last5 = last5ByKp.get(kpId) ?? [];
    last5.push(row.isCorrect);
    if (last5.length > 5) last5.shift();
    last5ByKp.set(kpId, last5);
  }

  for (const [kpId, last5] of last5ByKp) {
    const bucket = getBucket(kpId);
    bucket.recentTotal = last5.length;
    bucket.recentCorrect = last5.filter(Boolean).length;
  }

  for (const row of wrongRows) {
    const kpId = kpByQuestion.get(row.questionId);
    if (!kpId) continue;
    getBucket(kpId).wrongCount += 1;
  }

  const knowledgePoints: KnowledgeAnalysis[] = roots.map((root) => {
    const children = root.children.map((child) =>
      toAnalysis(child.id, child.name, rollup(tree.descendantsOf, perKp, child.id))
    );
    return {
      ...toAnalysis(root.id, root.name, rollup(tree.descendantsOf, perKp, root.id)),
      children,
    };
  });

  const totalQuestions = answerRows.length;
  const correct = answerRows.filter((row) => row.isCorrect).length;
  const overallAccuracy = totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0;
  const weightedTopics = knowledgePoints.filter((kp) => kp.count > 0);
  const weightedCountTotal = weightedTopics.reduce((sum, kp) => sum + kp.count, 0);
  const overallMastery = weightedCountTotal
    ? Math.round(
        weightedTopics.reduce((sum, kp) => sum + kp.mastery * kp.count, 0) / weightedCountTotal
      )
    : 0;
  const studiedKnowledgePoints = knowledgePoints
    .flatMap((kp) => [kp, ...(kp.children ?? [])])
    .filter((kp) => kp.count > 0).length;
  const weakPoints = knowledgePoints
    .flatMap((kp) => (kp.children?.length ? kp.children : [kp]))
    .filter((kp) => kp.count > 0)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, WEAK_TOPICS_LIMIT);

  const trend = trendKeys.map((date) => {
    const bucket = answerCountByDate.get(date);
    return {
      date,
      count: bucket?.count ?? 0,
      accuracy: bucket && bucket.count ? Math.round((bucket.correct / bucket.count) * 100) : 0,
    };
  });
  const last7 = trend.slice(-7);
  const recentDailyAvg = last7.length
    ? Math.round((last7.reduce((sum, day) => sum + day.count, 0) / last7.length) * 10) / 10
    : 0;
  let recent7Count = 0;
  let recent7Correct = 0;
  for (const key of recent7Keys) {
    const bucket = answerCountByDate.get(key);
    if (!bucket) continue;
    recent7Count += bucket.count;
    recent7Correct += bucket.correct;
  }
  const recentAccuracy = recent7Count ? Math.round((recent7Correct / recent7Count) * 100) : 0;
  const regularity =
    studyDaysSet.size >= 20 ? '规律' : studyDaysSet.size >= 10 ? '一般' : '不够规律';
  const predictedAMScore = Math.round((overallMastery / 100) * 75);
  const passProbability =
    overallMastery >= PASS_MASTERY_THRESHOLD
      ? '高'
      : overallMastery >= MEDIUM_MASTERY_THRESHOLD
        ? '中'
        : '低';
  const exam = getNextExamCountdown(new Date(), targetExamDate);
  const totalWrong = wrongRows.reduce((sum, row) => sum + row._count._all, 0);
  const unmasteredCount = await prisma.wrongNote.count({
    where: { userId, markedMastered: false },
  });
  const streakDates = answerRows.map((row) => row.createdAt);

  return {
    overview: {
      totalQuestions,
      overallAccuracy,
      overallMastery,
      streak: getContinuousDays(streakDates),
      studiedKnowledgePoints,
      totalKnowledgePoints,
      predictedAMScore,
      passProbability,
      daysToExam: exam.days,
      wrongCount: totalWrong,
      unmasteredCount,
      recentDailyAvg,
      recentAccuracy,
      regularity,
    },
    knowledgePoints,
    weakPoints,
    trend,
    longTimeTopics: knowledgePoints
      .filter((kp) => kp.avgTime > 90)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, WEAK_TOPICS_LIMIT),
  };
}
