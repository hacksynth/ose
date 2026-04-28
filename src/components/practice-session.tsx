'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Home, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AIExplainButton } from '@/components/ai-explain-button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { showToast } from '@/lib/toast-client';

type Option = { id: string; label: string; content: string };
type Question = {
  id: string;
  content: string;
  difficulty: number;
  questionNumber: number;
  explanation: string;
  knowledgePoint: { id: string; name: string; parent?: { id: string; name: string } | null };
  options: Option[];
};
type Result = {
  isCorrect: boolean;
  explanation: string;
  correctOptionId: string;
  options: Array<Option & { isCorrect: boolean }>;
};
type Summary = {
  mode?: string;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  timeSpent: number;
  weakTopics: Array<{ name: string; wrong: number }>;
};

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function PracticeSession() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') || '';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [results, setResults] = useState<Record<string, Result>>({});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!sessionId) {
      router.replace('/practice');
      return;
    }
    let cancelled = false;
    const raw = sessionStorage.getItem(`ose-practice-${sessionId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setQuestions(parsed);
          setStartedAt(Date.now());
          return;
        }
      } catch {
        sessionStorage.removeItem(`ose-practice-${sessionId}`);
      }
    }
    (async () => {
      try {
        const response = await fetch(`/api/practice/session/${sessionId}`);
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
          router.replace('/practice');
          return;
        }
        sessionStorage.setItem(`ose-practice-${sessionId}`, JSON.stringify(data.questions));
        setQuestions(data.questions);
        setStartedAt(Date.now());
        if (data.results && typeof data.results === 'object') setResults(data.results);
      } catch {
        if (!cancelled) router.replace('/practice');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const question = questions[index];
  const result = question ? results[question.id] : undefined;
  const progress = questions.length ? Math.round(((index + 1) / questions.length) * 100) : 0;
  const correctCount = useMemo(
    () => Object.values(results).filter((item) => item.isCorrect).length,
    [results]
  );

  async function submitAnswer() {
    if (!question || !selectedOptionId || result || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/practice/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: question.id,
          selectedOptionId,
          timeSpent: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast({ title: '提交失败', description: data.message || '请稍后重试' });
        return;
      }
      setResults((prev) => ({ ...prev, [question.id]: data }));
    } catch {
      showToast({ title: '网络异常', description: '请稍后重试' });
    } finally {
      setSubmitting(false);
    }
  }

  async function nextQuestion() {
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      setSelectedOptionId('');
      setStartedAt(Date.now());
      return;
    }
    try {
      const response = await fetch(`/api/practice/summary?sessionId=${sessionId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        showToast({ title: '加载总结失败', description: '请稍后重试' });
        return;
      }
      setSummary(data);
    } catch {
      showToast({ title: '网络异常', description: '请稍后重试' });
    }
  }

  function previousQuestion() {
    if (index === 0) return;
    const nextIndex = index - 1;
    setIndex(nextIndex);
    setSelectedOptionId('');
    setStartedAt(Date.now());
  }

  if (!question && !summary) {
    return (
      <Card className="mx-auto mt-6 max-w-3xl p-6 text-center font-bold text-muted sm:p-8">
        正在载入练习...
      </Card>
    );
  }

  if (summary) {
    return (
      <main className="mx-auto mt-6 max-w-5xl md:mt-8">
        <Card className="p-5 sm:p-8 md:p-10">
          <p className="text-sm font-black text-primary">
            {summary.mode === 'wrong-note-retry' ? '错题重练完成' : '练习完成'}
          </p>
          <h1 className="mt-3 text-3xl font-black text-navy sm:text-4xl">
            {summary.mode === 'wrong-note-retry' ? '掌握改进统计' : '本次练习总结'}
          </h1>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl bg-softYellow p-6">
              <p className="font-black text-muted">总题数</p>
              <p className="mt-3 text-4xl font-black">{summary.total}</p>
            </div>
            <div className="rounded-3xl bg-softGreen p-6">
              <p className="font-black text-muted">正确数</p>
              <p className="mt-3 text-4xl font-black">{summary.correct}</p>
            </div>
            <div className="rounded-3xl bg-softBlue p-6">
              <p className="font-black text-muted">正确率</p>
              <p className="mt-3 text-4xl font-black">{summary.accuracy}%</p>
            </div>
            <div className="rounded-3xl bg-softRose p-6">
              <p className="font-black text-muted">用时</p>
              <p className="mt-3 text-4xl font-black">{formatSeconds(summary.timeSpent)}</p>
            </div>
          </div>
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-black text-navy">薄弱知识点</h2>
            {summary.weakTopics.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {summary.weakTopics.map((topic) => (
                  <span
                    key={topic.name}
                    className="rounded-full bg-primary-soft px-4 py-2 font-black text-primary"
                  >
                    {topic.name} · 错 {topic.wrong} 题
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 font-semibold text-muted">本次没有错题，保持状态！</p>
            )}
          </div>
          <div className="mt-8 grid gap-3 sm:flex">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/practice">
                <Home className="h-4 w-4" />
                返回练习
              </Link>
            </Button>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/dashboard">回到仪表盘</Link>
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-6 max-w-5xl space-y-5 md:mt-8 md:space-y-6">
      <Card className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="font-black text-navy">
            第 {index + 1}/{questions.length} 题
          </span>
          <span className="rounded-full bg-primary-soft px-4 py-2 text-sm font-black text-primary">
            {question.knowledgePoint.parent?.name ?? question.knowledgePoint.name} ·{' '}
            {question.knowledgePoint.name}
          </span>
          <span className="flex items-center gap-2 font-black text-muted">
            <Clock3 className="h-4 w-4" />
            {formatSeconds(elapsed)}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-7 md:p-10">
        <p className="mb-4 text-sm font-black text-muted">
          2023 上午 · 第 {question.questionNumber} 题 · 难度 {question.difficulty}
        </p>
        <MarkdownRenderer
          content={question.content}
          className="text-xl font-black leading-relaxed text-navy md:text-3xl [&_img]:my-3 [&_img]:rounded-2xl"
        />
        <div className="mt-8 grid gap-4">
          {question.options.map((option) => {
            const submittedOption = result?.options.find((item) => item.id === option.id);
            const isSelected = selectedOptionId === option.id;
            const isCorrect = submittedOption?.isCorrect;
            const isWrongSelected = result && isSelected && !isCorrect;
            return (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(result)}
                onClick={() => setSelectedOptionId(option.id)}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-3xl border-2 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft sm:gap-4 sm:p-5',
                  isSelected && !result && 'border-primary bg-primary-soft',
                  isCorrect && result && 'border-green-300 bg-green-50',
                  isWrongSelected && 'border-red-300 bg-red-50'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-warm font-black text-navy',
                    isSelected && !result && 'bg-primary text-white',
                    isCorrect && result && 'bg-green-500 text-white',
                    isWrongSelected && 'bg-red-500 text-white'
                  )}
                >
                  {option.label}
                </span>
                <span className="pt-1 font-bold leading-relaxed text-navy">{option.content}</span>
              </button>
            );
          })}
        </div>

        {result ? (
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-soft">
            <div className="mb-3 flex items-center gap-2 text-xl font-black text-navy">
              {result.isCorrect ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              {result.isCorrect ? '回答正确' : '回答错误'}
            </div>
            <p className="font-semibold leading-8 text-muted">{result.explanation}</p>
            <AIExplainButton questionId={question.id} userAnswerOptionId={selectedOptionId} />
          </div>
        ) : null}

        <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <Button
            variant="secondary"
            onClick={previousQuestion}
            disabled={index === 0}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            上一题
          </Button>
          {!result ? (
            <Button
              onClick={submitAnswer}
              disabled={!selectedOptionId || submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}确认作答
            </Button>
          ) : (
            <Button onClick={nextQuestion} className="w-full sm:w-auto">
              {index === questions.length - 1 ? '查看总结' : '下一题'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
