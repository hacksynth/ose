import { prisma } from '@/lib/prisma';
import { getUserAnalysis } from '@/lib/analysis';
import { getChinaDateKey, getTodayRange } from '@/lib/stats';
import { getOrSetAnalysis, getOrSetStable } from '@/lib/ai/context-cache';

const MAX_CONTEXT_CHARS = 18_000;
const MAX_TODAY_CHOICE_DETAILS = 80;
const MAX_WRONG_NOTE_DETAILS = 80;
const MAX_CASE_ANSWER_DETAILS = 20;
const MAX_RECENT_EXAMS = 5;
const MAX_TEXT_CHARS = {
  question: 180,
  option: 90,
  explanation: 180,
  note: 80,
  caseAnswer: 140,
  feedback: 140,
};

type OptionLike = {
  id?: string | null;
  label?: string | null;
  content?: string | null;
};

type TopicLike = {
  name: string;
  parent?: { name: string } | null;
};

type QuestionLike = {
  id: string;
  content: string;
  explanation?: string | null;
  year?: number | null;
  session?: string | null;
  questionNumber?: number | null;
  knowledgePoint: TopicLike;
  options?: Array<OptionLike & { isCorrect?: boolean | null }>;
};

type ChoiceAnswerDetail = {
  source: '练习' | '模考';
  answeredAt: Date;
  isCorrect: boolean;
  timeSpent: number;
  selectedOption: OptionLike | null;
  question: QuestionLike;
  examTitle?: string;
};

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(value: string) {
  return decodeBasicEntities(value)
    .replace(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, ' [图片:$1] ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function compactText(value: string | null | undefined, maxLength: number) {
  const text = htmlToText(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '无';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function jsonTasks(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((task) => String(task ?? '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function formatDateKey(date: Date | null | undefined) {
  return date ? getChinaDateKey(date) : '未设置';
}

function formatChinaTime(date: Date | null | undefined) {
  if (!date) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTopic(topic: TopicLike) {
  return topic.parent?.name ? `${topic.parent.name}/${topic.name}` : topic.name;
}

function formatQuestionRef(question: QuestionLike) {
  const session = question.session === 'AM' ? '上午' : question.session === 'PM' ? '下午' : null;
  const examRef =
    question.year && session && question.questionNumber
      ? `${question.year}${session}第${question.questionNumber}题`
      : null;
  return examRef
    ? `${examRef} · ${formatTopic(question.knowledgePoint)}`
    : formatTopic(question.knowledgePoint);
}

function formatOption(option: OptionLike | null | undefined, maxLength = MAX_TEXT_CHARS.option) {
  if (!option) return '未知';
  const label = option.label ? `${option.label}. ` : '';
  return `${label}${compactText(option.content, maxLength)}`;
}

function correctOptionOf(question: QuestionLike) {
  return question.options?.find((option) => option.isCorrect) ?? null;
}

function truncateLines(lines: string[], emptyText: string) {
  return lines.length ? lines.join('\n') : emptyText;
}

function formatChoiceAnswerLine(answer: ChoiceAnswerDetail, index: number) {
  const status = answer.isCorrect ? '对' : '错';
  const correctOption = correctOptionOf(answer.question);
  const examPrefix = answer.examTitle ? ` · ${answer.examTitle}` : '';
  return `${index + 1}. [${status}] ${formatChinaTime(answer.answeredAt)} · ${answer.source}${examPrefix} · ${formatQuestionRef(answer.question)} · 学生选择：${formatOption(answer.selectedOption)} · 正确答案：${formatOption(correctOption)} · 题干：${compactText(answer.question.content, MAX_TEXT_CHARS.question)}`;
}

function formatWrongChoiceDetail(answer: ChoiceAnswerDetail, index: number) {
  const correctOption = correctOptionOf(answer.question);
  const examPrefix = answer.examTitle ? ` · ${answer.examTitle}` : '';
  return `${index + 1}. ${formatChinaTime(answer.answeredAt)} · ${answer.source}${examPrefix} · ${formatQuestionRef(answer.question)}
题干：${compactText(answer.question.content, MAX_TEXT_CHARS.question)}
学生选择：${formatOption(answer.selectedOption)}
正确答案：${formatOption(correctOption)}
题库解析：${compactText(answer.question.explanation, MAX_TEXT_CHARS.explanation)}`;
}

async function fetchStableData(userId: string) {
  const [activePlan, wrongNotes, recentExams] = await Promise.all([
    prisma.studyPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        targetExamDate: true,
        totalDays: true,
        days: {
          orderBy: { dayNumber: 'asc' },
          select: { dayNumber: true, date: true, tasks: true, completed: true },
        },
      },
    }),
    prisma.wrongNote.findMany({
      where: { userId, markedMastered: false },
      orderBy: { updatedAt: 'desc' },
      take: MAX_WRONG_NOTE_DETAILS,
      select: {
        id: true,
        questionId: true,
        updatedAt: true,
        note: true,
        markedMastered: true,
        question: {
          select: {
            id: true,
            content: true,
            explanation: true,
            year: true,
            session: true,
            questionNumber: true,
            knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
            options: {
              orderBy: { label: 'asc' },
              select: { id: true, label: true, content: true, isCorrect: true },
            },
            userAnswers: {
              where: { userId, isCorrect: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                createdAt: true,
                selectedOption: { select: { id: true, label: true, content: true } },
              },
            },
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { finishedAt: 'desc' },
      take: MAX_RECENT_EXAMS,
      select: {
        totalScore: true,
        choiceScore: true,
        caseScore: true,
        finishedAt: true,
        exam: { select: { title: true, totalScore: true } },
      },
    }),
  ]);

  const wrongQuestionIds = wrongNotes.map((note) => note.questionId);
  const examWrongAnswers = wrongQuestionIds.length
    ? await prisma.examAnswer.findMany({
        where: {
          questionId: { in: wrongQuestionIds },
          selectedOptionId: { not: null },
          isCorrect: false,
          examAttempt: { userId, status: 'COMPLETED' },
        },
        select: {
          questionId: true,
          selectedOption: { select: { id: true, label: true, content: true } },
          examAttempt: { select: { finishedAt: true, startedAt: true } },
        },
      })
    : [];

  return { activePlan, wrongNotes, recentExams, examWrongAnswers };
}

async function fetchTodayData(userId: string, todayRange: { start: Date; end: Date }) {
  const [
    todayPracticeChoiceCount,
    todayPracticeWrongCount,
    todayExamChoiceCount,
    todayExamWrongCount,
    todayPracticeAnswers,
    todayExamAnswers,
    todayCaseCount,
    todayCaseAnswers,
  ] = await Promise.all([
    prisma.userAnswer.count({
      where: { userId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
    }),
    prisma.userAnswer.count({
      where: { userId, isCorrect: false, createdAt: { gte: todayRange.start, lt: todayRange.end } },
    }),
    prisma.examAnswer.count({
      where: {
        selectedOptionId: { not: null },
        isCorrect: { not: null },
        question: { type: 'CHOICE' },
        examAttempt: {
          userId,
          status: 'COMPLETED',
          finishedAt: { gte: todayRange.start, lt: todayRange.end },
        },
      },
    }),
    prisma.examAnswer.count({
      where: {
        selectedOptionId: { not: null },
        isCorrect: false,
        question: { type: 'CHOICE' },
        examAttempt: {
          userId,
          status: 'COMPLETED',
          finishedAt: { gte: todayRange.start, lt: todayRange.end },
        },
      },
    }),
    prisma.userAnswer.findMany({
      where: { userId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        isCorrect: true,
        timeSpent: true,
        selectedOption: { select: { id: true, label: true, content: true } },
        question: {
          select: {
            id: true,
            content: true,
            explanation: true,
            year: true,
            session: true,
            questionNumber: true,
            knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
            options: {
              orderBy: { label: 'asc' },
              select: { id: true, label: true, content: true, isCorrect: true },
            },
          },
        },
      },
    }),
    prisma.examAnswer.findMany({
      where: {
        selectedOptionId: { not: null },
        isCorrect: { not: null },
        question: { type: 'CHOICE' },
        examAttempt: {
          userId,
          status: 'COMPLETED',
          finishedAt: { gte: todayRange.start, lt: todayRange.end },
        },
      },
      select: {
        isCorrect: true,
        timeSpent: true,
        selectedOption: { select: { id: true, label: true, content: true } },
        examAttempt: {
          select: { finishedAt: true, startedAt: true, exam: { select: { title: true } } },
        },
        question: {
          select: {
            id: true,
            content: true,
            explanation: true,
            year: true,
            session: true,
            questionNumber: true,
            knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
            options: {
              orderBy: { label: 'asc' },
              select: { id: true, label: true, content: true, isCorrect: true },
            },
          },
        },
      },
    }),
    prisma.userCaseAnswer.count({
      where: { userId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
    }),
    prisma.userCaseAnswer.findMany({
      where: { userId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
      orderBy: { createdAt: 'desc' },
      take: MAX_CASE_ANSWER_DETAILS,
      select: {
        createdAt: true,
        answer: true,
        score: true,
        feedback: true,
        caseSubQuestion: {
          select: {
            subNumber: true,
            content: true,
            referenceAnswer: true,
            score: true,
            caseScenario: {
              select: {
                question: {
                  select: {
                    id: true,
                    content: true,
                    year: true,
                    session: true,
                    questionNumber: true,
                    knowledgePoint: { select: { name: true, parent: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    todayPracticeChoiceCount,
    todayPracticeWrongCount,
    todayExamChoiceCount,
    todayExamWrongCount,
    todayPracticeAnswers,
    todayExamAnswers,
    todayCaseCount,
    todayCaseAnswers,
  };
}

export async function buildLearningKnowledgeBase(userId: string) {
  const todayRange = getTodayRange();
  const todayKey = getChinaDateKey(new Date());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, targetExamDate: true, createdAt: true },
  });

  const [analysis, stableData, todayData] = await Promise.all([
    getOrSetAnalysis(userId, () => getUserAnalysis(userId, user?.targetExamDate)),
    getOrSetStable(userId, () => fetchStableData(userId)),
    fetchTodayData(userId, todayRange),
  ]);

  const { activePlan, wrongNotes, recentExams, examWrongAnswers } = stableData;
  const {
    todayPracticeChoiceCount,
    todayPracticeWrongCount,
    todayExamChoiceCount,
    todayExamWrongCount,
    todayPracticeAnswers,
    todayExamAnswers,
    todayCaseCount,
    todayCaseAnswers,
  } = todayData;

  const latestExamWrongByQuestion = new Map<string, (typeof examWrongAnswers)[number]>();
  for (const answer of examWrongAnswers) {
    const existing = latestExamWrongByQuestion.get(answer.questionId);
    const answerTime = (answer.examAttempt.finishedAt ?? answer.examAttempt.startedAt).getTime();
    const existingTime = existing
      ? (existing.examAttempt.finishedAt ?? existing.examAttempt.startedAt).getTime()
      : 0;
    if (!existing || answerTime > existingTime)
      latestExamWrongByQuestion.set(answer.questionId, answer);
  }

  const todayChoiceCount = todayPracticeChoiceCount + todayExamChoiceCount;
  const todayWrongChoiceCount = todayPracticeWrongCount + todayExamWrongCount;

  const allTodayChoiceAnswers: ChoiceAnswerDetail[] = [
    ...todayPracticeAnswers.map((answer) => ({
      source: '练习' as const,
      answeredAt: answer.createdAt,
      isCorrect: answer.isCorrect,
      timeSpent: answer.timeSpent,
      selectedOption: answer.selectedOption,
      question: answer.question,
    })),
    ...todayExamAnswers.map((answer) => ({
      source: '模考' as const,
      answeredAt: answer.examAttempt.finishedAt ?? answer.examAttempt.startedAt,
      isCorrect: Boolean(answer.isCorrect),
      timeSpent: answer.timeSpent,
      selectedOption: answer.selectedOption,
      question: answer.question,
      examTitle: answer.examAttempt.exam.title,
    })),
  ].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());

  const todayChoiceAnswers = allTodayChoiceAnswers.slice(0, MAX_TODAY_CHOICE_DETAILS);
  const todayWrongChoiceAnswers = allTodayChoiceAnswers
    .filter((answer) => !answer.isCorrect)
    .slice(0, MAX_TODAY_CHOICE_DETAILS);

  const weakPoints = analysis.weakPoints
    .slice(0, 8)
    .map(
      (point, index) =>
        `${index + 1}. ${point.name}：${point.count}题，正确率${point.accuracy}%，掌握度${point.mastery}，错题${point.wrongCount}`
    )
    .join('\n');

  const practicedPoints = analysis.knowledgePoints
    .flatMap((point) => [point, ...(point.children ?? [])])
    .filter((point) => point.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map(
      (point) => `${point.name}：${point.count}题，正确率${point.accuracy}%，掌握度${point.mastery}`
    )
    .join('\n');

  const todayPlanDay =
    activePlan?.days.find((day) => getChinaDateKey(day.date) === todayKey) ??
    activePlan?.days.find((day) => !day.completed) ??
    activePlan?.days[0] ??
    null;
  const todayTasks = todayPlanDay ? jsonTasks(todayPlanDay.tasks) : [];
  const completedPlanDays = activePlan?.days.filter((day) => day.completed).length ?? 0;

  const todayChoiceLines = todayChoiceAnswers.map(formatChoiceAnswerLine);
  const todayWrongLines = todayWrongChoiceAnswers.map(formatWrongChoiceDetail);
  const todayChoiceTruncation =
    todayChoiceCount > todayChoiceAnswers.length
      ? `\n（今日选择题明细已截断：仅显示前 ${todayChoiceAnswers.length}/${todayChoiceCount} 条）`
      : '';
  const todayWrongTruncation =
    todayWrongChoiceCount > todayWrongChoiceAnswers.length
      ? `\n（今日错题明细已截断：仅显示前 ${todayWrongChoiceAnswers.length}/${todayWrongChoiceCount} 条）`
      : '';

  const wrongNoteLines = wrongNotes.map((note, index) => {
    const practiceWrong = note.question.userAnswers[0];
    const examWrong = latestExamWrongByQuestion.get(note.questionId);
    const latestWrongAt =
      practiceWrong?.createdAt ??
      examWrong?.examAttempt.finishedAt ??
      examWrong?.examAttempt.startedAt ??
      note.updatedAt;
    const wrongOption = practiceWrong?.selectedOption ?? examWrong?.selectedOption ?? null;
    const userNote = note.note ? `；个人笔记：${compactText(note.note, MAX_TEXT_CHARS.note)}` : '';
    return `${index + 1}. ${formatChinaTime(latestWrongAt)} · ${formatQuestionRef(note.question)} · 学生曾选：${formatOption(wrongOption)} · 正确答案：${formatOption(correctOptionOf(note.question))} · 题干：${compactText(note.question.content, MAX_TEXT_CHARS.question)}${userNote}`;
  });
  const wrongNoteTruncation =
    analysis.overview.unmasteredCount > wrongNotes.length
      ? `\n（未掌握错题明细已截断：仅显示最近 ${wrongNotes.length}/${analysis.overview.unmasteredCount} 条）`
      : '';

  const caseAnswerLines = todayCaseAnswers.map((answer, index) => {
    const sub = answer.caseSubQuestion;
    const question = sub.caseScenario.question;
    return `${index + 1}. ${formatChinaTime(answer.createdAt)} · ${formatQuestionRef(question)} · 子题${sub.subNumber}/${sub.score}分 · 得分：${answer.score ?? '未评分'} · 题目：${compactText(sub.content, MAX_TEXT_CHARS.question)} · 我的答案：${compactText(answer.answer, MAX_TEXT_CHARS.caseAnswer)} · 参考答案：${compactText(sub.referenceAnswer, MAX_TEXT_CHARS.caseAnswer)} · 反馈：${compactText(answer.feedback, MAX_TEXT_CHARS.feedback)}`;
  });

  const recentExamLines = recentExams.map((exam, index) => {
    return `${index + 1}. ${exam.exam.title}：${exam.totalScore ?? 0}/${exam.exam.totalScore}，上午${exam.choiceScore ?? 0}，下午${exam.caseScore ?? 0}，完成于${formatDateKey(exam.finishedAt)}`;
  });

  const activePlanLine = activePlan
    ? `计划：${activePlan.title}
目标日期：${formatDateKey(activePlan.targetExamDate)}
进度：${completedPlanDays}/${activePlan.days.length || activePlan.totalDays}天已完成
当前任务日：第${todayPlanDay?.dayNumber ?? '-'}天（${todayPlanDay ? formatDateKey(todayPlanDay.date) : '日期未知'}，${todayPlanDay?.completed ? '已完成' : '未完成'}）
任务：
${todayTasks.map((task, index) => `${index + 1}. ${task}`).join('\n') || '今日任务为空'}`
    : '暂无启用中的学习计划';

  const context = `## 学生当前学习情况知识库
使用规则：
- 以下数据是该学生的真实学习上下文。回答"今天错题/今天做题/错题本/学习计划/薄弱点"时，优先使用对应明细，不要要求学生再上传截图或题干。
- 如果明细里已经列出题干、学生选择、正确答案和解析，可以直接据此复盘。
- 不要编造没有出现在数据中的成绩、题目、选项、计划或日期。若某类数据为空或被截断，要明确说明。

### 学生档案
- 姓名：${user?.name ?? '未设置'}
- 目标考试日期：${formatDateKey(user?.targetExamDate)}
- 账号创建日期：${formatDateKey(user?.createdAt)}

### 总览
- 累计选择题作答：${analysis.overview.totalQuestions}题
- 总体正确率：${analysis.overview.overallAccuracy}%
- 总体掌握度：${analysis.overview.overallMastery}%
- 连续学习：${analysis.overview.streak}天
- 距离考试：${analysis.overview.daysToExam}天
- 预测上午分：${analysis.overview.predictedAMScore}/75
- 通过概率：${analysis.overview.passProbability}
- 错题总数：${analysis.overview.wrongCount}，未掌握错题：${analysis.overview.unmasteredCount}
- 最近7天：日均${analysis.overview.recentDailyAvg}题，正确率${analysis.overview.recentAccuracy}%，规律性${analysis.overview.regularity}
- 今日完成：选择题${todayChoiceCount}题（错${todayWrongChoiceCount}题），案例题作答${todayCaseCount}条

### 薄弱知识点
${weakPoints || '暂无足够练习数据'}

### 已练知识点概览
${practicedPoints || '暂无足够练习数据'}

### 今日错题明细
${truncateLines(todayWrongLines, '今日暂无选择题错题记录')}${todayWrongTruncation}

### 今日选择题作答明细
${truncateLines(todayChoiceLines, '今日暂无选择题作答记录')}${todayChoiceTruncation}

### 未掌握错题本明细
${truncateLines(wrongNoteLines, '暂无未掌握错题')}${wrongNoteTruncation}

### 今日案例题作答明细
${truncateLines(caseAnswerLines, '今日暂无案例题作答记录')}

### 最近模拟考试
${truncateLines(recentExamLines, '暂无已完成模拟考试')}

### 当前学习计划
${activePlanLine}`;

  return context.length > MAX_CONTEXT_CHARS
    ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n...（学情知识库已截断）`
    : context;
}
