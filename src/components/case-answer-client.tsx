'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AIGradeCaseButton } from '@/components/ai-grade-case-button';
import { CaseFigures } from '@/components/case-figures';
import { MarkdownRenderer } from '@/components/markdown-renderer';

type SubQuestion = {
  id: string;
  subNumber: number;
  content: string;
  answerType: 'FILL_BLANK' | 'SHORT_ANSWER' | 'DIAGRAM_FILL';
  score: number;
  referenceAnswer: string;
  explanation: string;
};
type CaseQuestion = {
  id: string;
  content: string;
  difficulty: number;
  knowledgePoint: { name: string; parent?: { name: string } | null };
  caseScenario: { id: string; background: string; figures?: unknown; subQuestions: SubQuestion[] };
};
type Result = {
  caseSubQuestionId: string;
  subNumber: number;
  answer: string;
  score: number;
  maxScore: number;
  feedback: string;
  referenceAnswer: string;
  explanation: string;
};

export function CaseAnswerClient({ question }: { question: CaseQuestion }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const maxScore = question.caseScenario.subQuestions.reduce((sum, item) => sum + item.score, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/practice/cases/${question.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: question.caseScenario.subQuestions.map((sub) => ({
            caseSubQuestionId: sub.id,
            answer: answers[sub.id] ?? '',
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || '提交失败，请稍后重试');
        return;
      }
      setResults(data.results);
      setTotalScore(data.totalScore);
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  function renderInput(sub: SubQuestion) {
    const value = answers[sub.id] ?? '';
    const common = {
      value,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
        setAnswers((prev) => ({ ...prev, [sub.id]: event.target.value })),
      disabled: Boolean(results),
      className: 'ose-input w-full',
    };
    if (sub.answerType === 'FILL_BLANK')
      return <input {...common} placeholder="填写关键词或短语" maxLength={4000} />;
    return (
      <textarea
        {...common}
        rows={sub.answerType === 'DIAGRAM_FILL' ? 4 : 6}
        maxLength={4000}
        placeholder={
          sub.answerType === 'DIAGRAM_FILL'
            ? '按编号填写图中空缺项，例如：1=实体A；2=数据流B'
            : '请输入你的分析答案'
        }
      />
    );
  }

  return (
    <main className="mx-auto mt-6 max-w-7xl md:mt-8">
      <div className="space-y-6">
        <Card className="p-5 hover:translate-y-0 sm:p-7">
          <p className="mb-3 text-sm font-black text-primary">
            案例背景 · {question.knowledgePoint.parent?.name ?? question.knowledgePoint.name} /{' '}
            {question.knowledgePoint.name}
          </p>
          <h1 className="text-2xl font-black text-navy sm:text-3xl">{question.content}</h1>
          <MarkdownRenderer
            content={question.caseScenario.background}
            className="mt-6 text-base font-semibold leading-8 text-muted [&_img]:mx-auto [&_img]:my-3 [&_img]:rounded-2xl"
          />
          <CaseFigures figures={question.caseScenario.figures} />
        </Card>
        <form onSubmit={submit} className="space-y-5">
          {question.caseScenario.subQuestions.map((sub) => {
            const result = results?.find((item) => item.caseSubQuestionId === sub.id);
            return (
              <Card key={sub.id} className="p-5 hover:translate-y-0 sm:p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black text-navy">第 {sub.subNumber} 题</h2>
                  <span className="rounded-full bg-softYellow px-3 py-1 text-sm font-black text-navy">
                    {sub.score} 分
                  </span>
                </div>
                <MarkdownRenderer
                  content={sub.content}
                  className="mb-4 font-bold leading-7 text-navy [&_img]:my-3 [&_img]:rounded-2xl"
                />
                {renderInput(sub)}
                {result ? (
                  <div className="mt-5 space-y-3">
                    <div className="rounded-3xl bg-softGreen p-4">
                      <p className="font-black text-green-800">参考答案</p>
                      <MarkdownRenderer
                        content={result.referenceAnswer}
                        className="mt-2 font-semibold leading-7 text-green-900 [&_img]:my-3 [&_img]:rounded-2xl"
                      />
                    </div>
                    <div className="rounded-3xl bg-white p-4 shadow-soft">
                      <p className="font-black text-navy">
                        得分：{result.score}/{result.maxScore}
                      </p>
                      <p className="mt-2 font-semibold leading-7 text-muted">{result.feedback}</p>
                      <p className="mt-2 font-semibold leading-7 text-muted">
                        解析：{result.explanation}
                      </p>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">
              {error}
            </p>
          ) : null}
          {results ? (
            <>
              <Card className="bg-navy p-5 text-white hover:translate-y-0 sm:p-7">
                <p className="text-sm font-black text-white/60">总得分</p>
                <p className="mt-2 text-4xl font-black sm:text-5xl">
                  {totalScore}
                  <span className="text-xl">/{maxScore} 分</span>
                </p>
              </Card>
              <AIGradeCaseButton caseScenarioId={question.caseScenario.id} userAnswers={answers} />
            </>
          ) : (
            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}提交全部答案
            </Button>
          )}
        </form>
      </div>
    </main>
  );
}
