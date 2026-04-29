'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ContinueAIChatButton } from '@/components/continue-ai-chat-button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { VariantQuestions } from '@/components/variant-questions';
import { useAIStatus } from '@/components/ai-status-context';

export function AIExplainButton({
  questionId,
  userAnswerOptionId,
}: {
  questionId: string;
  userAnswerOptionId?: string;
}) {
  const status = useAIStatus();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function explain() {
    setLoading(true);
    setContent('');
    setError('');
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswerOptionId }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || 'AI 服务暂时不可用，请稍后再试');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setContent((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError('网络异常，请稍后再试');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={explain}
          disabled={!status.configured || loading}
          title={!status.configured ? '请先配置文本 AI，生图 AI 不会启用文字讲解' : undefined}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="h-4 w-4" />
          )}
          {loading ? 'AI 正在思考...' : status.configured ? 'AI 深度讲解' : '未配置文本 AI'}
        </Button>
        {!status.configured ? (
          <Button asChild variant="ghost">
            <Link href="/profile">去配置</Link>
          </Button>
        ) : null}
      </div>
      {!status.configured ? (
        <p className="mt-3 rounded-2xl bg-softYellow px-4 py-3 text-sm font-bold text-muted">
          AI 深度讲解需要配置文本 AI；生图 AI 只用于错题讲解图。
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">
          {error}
        </p>
      ) : null}
      {content ? (
        <Card className="mt-4 bg-softYellow/60 p-5 hover:translate-y-0">
          <div className="mb-4 flex justify-end">
            <ContinueAIChatButton
              title="AI 深度讲解"
              messages={[
                {
                  role: 'user',
                  content: `请对这道题进行 AI 深度讲解。题目 ID：${questionId}${userAnswerOptionId ? `，我的选项 ID：${userAnswerOptionId}` : ''}`,
                },
                { role: 'assistant', content },
              ]}
            />
          </div>
          <MarkdownRenderer content={content} />
          <VariantQuestions questionId={questionId} />
        </Card>
      ) : null}
    </div>
  );
}
