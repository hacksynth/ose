'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Flag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CaseFigures } from '@/components/case-figures';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { showToast } from '@/lib/toast-client';
import { EXAM_WARN_THRESHOLD_SEC } from '@/lib/constants';

type Option = { id: string; label: string; content: string };
type Sub = { id: string; subNumber: number; content: string; score: number };
type ExamQuestion = {
  orderNumber: number;
  question: {
    id: string;
    type: 'CHOICE' | 'CASE_ANALYSIS';
    content: string;
    options: Option[];
    caseScenario?: { background: string; figures?: unknown; subQuestions: Sub[] } | null;
  };
};
type Attempt = {
  id: string;
  startedAt: string | Date;
  status: string;
  exam: {
    title: string;
    session: 'AM' | 'PM' | 'FULL';
    timeLimit: number;
    questions: ExamQuestion[];
  };
  answers: Array<{ questionId: string; selectedOptionId?: string | null; caseAnswers?: unknown }>;
};

type AnswerState = Record<
  string,
  { selectedOptionId?: string; caseAnswers?: Record<string, string>; marked?: boolean }
>;

function sanitizeCaseAnswers(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') result[k] = v;
  }
  return Object.keys(result).length ? result : undefined;
}

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export function ExamAttemptClient({ attempt }: { attempt: Attempt }) {
  const router = useRouter();
  const startedAtMs = useMemo(() => new Date(attempt.startedAt).getTime(), [attempt.startedAt]);
  const totalSeconds = attempt.exam.timeLimit * 60;
  const computeRemaining = useCallback(
    () => Math.max(0, totalSeconds - Math.floor((Date.now() - startedAtMs) / 1000)),
    [startedAtMs, totalSeconds]
  );

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>(() =>
    Object.fromEntries(
      attempt.answers.map((a) => [
        a.questionId,
        {
          selectedOptionId: a.selectedOptionId ?? undefined,
          caseAnswers: sanitizeCaseAnswers(a.caseAnswers),
        },
      ])
    )
  );
  const [remaining, setRemaining] = useState(computeRemaining);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const question = attempt.exam.questions[index];
  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter(
        (a) => a.selectedOptionId || (a.caseAnswers && Object.values(a.caseAnswers).some(Boolean))
      ).length,
    [answers]
  );

  const submit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      if (!auto) {
        const unanswered = attempt.exam.questions.length - answeredCount;
        if (
          !confirm(
            `共 ${attempt.exam.questions.length} 题，已答 ${answeredCount} 题，未答 ${unanswered} 题，确认交卷？`
          )
        )
          return;
      }
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const response = await fetch(`/api/exam/${attempt.id}/submit`, { method: 'POST' });
        if (!response.ok) {
          submittedRef.current = false;
          setSubmitting(false);
          const data = await response.json().catch(() => ({}));
          showToast({ title: '交卷失败', description: data.message || '请稍后重试' });
          return;
        }
        router.push(`/exam/${attempt.id}/result`);
      } catch {
        submittedRef.current = false;
        setSubmitting(false);
        showToast({ title: '网络异常', description: '请稍后重试' });
      }
    },
    [answeredCount, attempt.exam.questions.length, attempt.id, router]
  );

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    if (submittedRef.current) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = '考试进行中，确定离开吗？';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const tick = () => {
      const next = computeRemaining();
      setRemaining(next);
      if (next <= 0 && !submittedRef.current) {
        submitRef.current(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    const onVisibility = () => tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [computeRemaining]);

  const pendingSaveRef = useRef<{ questionId: string; payload: AnswerState[string] } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const latestAnswersRef = useRef(answers);
  useEffect(() => {
    latestAnswersRef.current = answers;
  }, [answers]);

  const flushSave = useCallback(async () => {
    const job = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!job || submittedRef.current) return;
    setSaveState('saving');
    try {
      const payload = latestAnswersRef.current[job.questionId] ?? job.payload;
      const response = await fetch(`/api/exam/${attempt.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: job.questionId,
          selectedOptionId: payload.selectedOptionId,
          caseAnswers: payload.caseAnswers,
          marked: payload.marked,
          timeSpent: Math.min(totalSeconds, totalSeconds - computeRemaining()),
        }),
      });
      setSaveState(response.ok ? 'idle' : 'error');
      if (!response.ok)
        showToast({ title: '答案保存失败', description: '答题卡已恢复本地内容，请继续作答' });
    } catch {
      setSaveState('error');
      showToast({ title: '网络异常', description: '答案未能同步，检查网络后继续作答' });
    }
  }, [attempt.id, computeRemaining, totalSeconds]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const save = useCallback(
    (questionId: string, patch: AnswerState[string]) => {
      setAnswers((prev) => {
        const next = { ...(prev[questionId] ?? {}), ...patch };
        pendingSaveRef.current = { questionId, payload: next };
        return { ...prev, [questionId]: next };
      });
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushSave, 600);
    },
    [flushSave]
  );

  const currentAnswer = answers[question.question.id];
  const handleSelect = useCallback(
    (id: string) => save(question.question.id, { selectedOptionId: id }),
    [save, question.question.id]
  );
  const handleCaseChange = useCallback(
    (value: Record<string, string>) => save(question.question.id, { caseAnswers: value }),
    [save, question.question.id]
  );
  const toggleMark = useCallback(
    () => save(question.question.id, { marked: !currentAnswer?.marked }),
    [save, question.question.id, currentAnswer?.marked]
  );

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-5">
      <header className="sticky top-20 z-30 rounded-[1.5rem] bg-white/90 p-4 shadow-soft backdrop-blur md:top-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-black text-navy">{attempt.exam.title}</h1>
          <div
            className={cn(
              'text-3xl font-black',
              remaining <= EXAM_WARN_THRESHOLD_SEC ? 'animate-pulse text-red-600' : 'text-primary'
            )}
            aria-live="polite"
            aria-label={`剩余时间 ${mmss(remaining)}`}
          >
            {mmss(remaining)}
          </div>
          <Button onClick={() => submit(false)} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}交卷
          </Button>
        </div>
        {saveState === 'saving' ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在保存...
          </p>
        ) : saveState === 'error' ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-red-600">
            <AlertTriangle className="h-4 w-4" />
            上次保存失败，已保留本地答案，请检查网络
          </p>
        ) : null}
      </header>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-44 lg:self-start">
          <AnswerCard
            questions={attempt.exam.questions}
            answers={answers}
            index={index}
            onJump={setIndex}
            answeredCount={answeredCount}
          />
        </aside>
        <Card className="p-5 hover:translate-y-0 sm:p-7">
          <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-2xl font-black text-navy">第 {question.orderNumber} 题</h2>
            <Button
              variant="secondary"
              onClick={toggleMark}
              aria-pressed={Boolean(currentAnswer?.marked)}
            >
              <Flag className="h-4 w-4" />
              {currentAnswer?.marked ? '取消标记' : '标记'}
            </Button>
          </div>
          {question.question.type === 'CHOICE' ? (
            <ChoiceQuestion
              question={question.question}
              selected={currentAnswer?.selectedOptionId}
              onSelect={handleSelect}
            />
          ) : (
            <CaseQuestion
              question={question.question}
              value={currentAnswer?.caseAnswers ?? EMPTY_CASE_VALUE}
              onChange={handleCaseChange}
            />
          )}
          <div className="mt-8 grid gap-3 sm:flex sm:justify-between">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((v) => v - 1)}
            >
              上一题
            </Button>
            <Button
              variant="secondary"
              disabled={index === attempt.exam.questions.length - 1}
              onClick={() => setIndex((v) => v + 1)}
            >
              下一题
            </Button>
          </div>
        </Card>
      </div>
      {remaining <= EXAM_WARN_THRESHOLD_SEC ? (
        <p
          className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 font-black text-red-600"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5" />
          距离考试结束不足 10 分钟，请注意交卷。
        </p>
      ) : null}
    </main>
  );
}

const EMPTY_CASE_VALUE: Record<string, string> = {};

type AnswerCardProps = {
  questions: ExamQuestion[];
  answers: AnswerState;
  index: number;
  onJump: (index: number) => void;
  answeredCount: number;
};

const AnswerCard = memo(function AnswerCard({
  questions,
  answers,
  index,
  onJump,
  answeredCount,
}: AnswerCardProps) {
  return (
    <Card className="p-4 hover:translate-y-0">
      <p className="mb-3 font-black text-navy">答题卡</p>
      <div className="grid grid-cols-5 gap-2" role="list">
        {questions.map((item, i) => {
          const state = answers[item.question.id];
          const done =
            state?.selectedOptionId ||
            (state?.caseAnswers && Object.values(state.caseAnswers).some(Boolean));
          return (
            <button
              key={item.question.id}
              type="button"
              role="listitem"
              onClick={() => onJump(i)}
              aria-label={`跳转到第 ${item.orderNumber} 题${done ? '（已答）' : '（未答）'}${state?.marked ? '（已标记）' : ''}`}
              aria-current={i === index ? 'true' : undefined}
              className={cn(
                'h-10 rounded-xl text-sm font-black',
                i === index && 'ring-2 ring-primary',
                state?.marked
                  ? 'bg-softYellow'
                  : done
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-muted'
              )}
            >
              {item.orderNumber}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm font-semibold text-muted">
        已答 {answeredCount}/{questions.length}
      </p>
    </Card>
  );
});

type ChoiceProps = {
  question: ExamQuestion['question'];
  selected?: string;
  onSelect: (id: string) => void;
};

const ChoiceQuestion = memo(function ChoiceQuestion({ question, selected, onSelect }: ChoiceProps) {
  return (
    <>
      <MarkdownRenderer
        content={question.content}
        className="text-xl font-black leading-relaxed text-navy [&>p]:my-2"
      />
      <div className="mt-6 grid gap-3" role="radiogroup" aria-label="选项">
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.id)}
              className={cn(
                'rounded-3xl border-2 bg-white p-4 text-left font-bold transition hover:border-primary sm:p-5',
                isSelected && 'border-primary bg-primary-soft'
              )}
            >
              {option.label}. {option.content}
            </button>
          );
        })}
      </div>
    </>
  );
});

type CaseProps = {
  question: ExamQuestion['question'];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
};

const CaseQuestion = memo(function CaseQuestion({ question, value, onChange }: CaseProps) {
  const handleSubChange = useCallback(
    (subId: string, nextValue: string) => {
      onChange({ ...value, [subId]: nextValue });
    },
    [onChange, value]
  );
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-warm p-5">
        <h3 className="text-xl font-black text-navy">{question.content}</h3>
        <MarkdownRenderer
          content={question.caseScenario?.background ?? ''}
          className="mt-4 font-semibold leading-8 text-muted [&_img]:mx-auto [&_img]:my-3 [&_img]:rounded-2xl"
        />
        <CaseFigures figures={question.caseScenario?.figures} />
      </div>
      <div className="space-y-4">
        {question.caseScenario?.subQuestions.map((sub) => (
          <div key={sub.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-baseline">
              <span className="font-black text-navy">（{sub.subNumber}）</span>
              <MarkdownRenderer
                content={sub.content}
                className="flex-1 font-black text-navy [&>p]:my-0"
              />
              <span className="text-sm font-bold text-muted">· {sub.score}分</span>
            </div>
            <label className="sr-only" htmlFor={`sub-${sub.id}`}>
              第 {sub.subNumber} 小题作答
            </label>
            <textarea
              id={`sub-${sub.id}`}
              className="ose-input min-h-28 w-full"
              value={value[sub.id] ?? ''}
              onChange={(e) => handleSubChange(sub.id, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
});
