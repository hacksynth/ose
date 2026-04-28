'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type StartPayload = {
  mode: 'random' | 'sequential' | 'topic' | 'ai';
  topicId?: string;
  limit?: number;
  questionIds?: string[];
};

export function StartPracticeButton({
  payload,
  children,
  variant = 'default',
  className,
}: {
  payload: StartPayload;
  children: React.ReactNode;
  variant?: 'default' | 'secondary';
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/practice/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || '无法开始练习');
        return;
      }
      sessionStorage.setItem(`ose-practice-${data.sessionId}`, JSON.stringify(data.questions));
      router.push(`/practice/session?sessionId=${data.sessionId}`);
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn('inline-flex flex-col items-start gap-2', className)}>
      <Button
        type="button"
        variant={variant}
        onClick={start}
        disabled={loading}
        className={className?.includes('w-full') ? 'w-full' : undefined}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
      </Button>
      {error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
