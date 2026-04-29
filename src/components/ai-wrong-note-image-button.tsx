'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Download, ImageIcon, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { showToast } from '@/lib/toast-client';
import { cn } from '@/lib/utils';

type GenerationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

type Generation = {
  id: string;
  status: GenerationStatus;
  imageUrl: string | null;
  createdAt: string;
  provider: string;
  model: string;
  imageSize: string;
  imageQuality: string;
  imageOutputFormat: string;
  imageStyle: string;
  errorMessage: string | null;
};

function isActiveStatus(status: GenerationStatus | undefined) {
  return status === 'PENDING' || status === 'RUNNING';
}

function statusLabel(status: GenerationStatus | undefined) {
  if (status === 'PENDING') return '讲解图已排队';
  if (status === 'RUNNING') return '正在生成讲解图';
  if (status === 'COMPLETED') return '讲解图已生成';
  if (status === 'FAILED') return '讲解图生成失败';
  return '';
}

export function AIWrongNoteImageButton({ wrongNoteId }: { wrongNoteId: string }) {
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState('');
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (!options?.silent) setLoading(true);
      try {
        const response = await fetch(
          `/api/ai/wrong-note-image?wrongNoteId=${encodeURIComponent(wrongNoteId)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const nextMessage = (data as { message?: string }).message || '讲解图状态加载失败';
          setMessage(nextMessage);
          setConfigured(false);
          return;
        }
        setConfigured(Boolean((data as { configured?: boolean }).configured));
        setMessage((data as { message?: string }).message || '');
        setGeneration(
          ((data as { generation?: Generation | null }).generation ?? null) as Generation | null
        );
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        setMessage('讲解图状态加载失败');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        if (!options?.silent) setLoading(false);
      }
    },
    [wrongNoteId]
  );

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!isActiveStatus(generation?.status)) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [generation?.status, load]);

  async function generate(force = false) {
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/ai/wrong-note-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrongNoteId, force }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const nextMessage = (data as { message?: string }).message || '讲解图生成失败';
        setMessage(nextMessage);
        showToast({ title: '讲解图生成失败', description: nextMessage });
        return;
      }
      const nextGeneration = (data as { generation: Generation }).generation;
      setGeneration(nextGeneration);
      setConfigured(true);
      showToast({
        title:
          nextGeneration.status === 'COMPLETED'
            ? force
              ? '讲解图已重新生成'
              : '讲解图已生成'
            : '讲解图已加入生成队列',
      });
    } catch {
      setMessage('网络异常，请稍后再试');
      showToast({ title: '网络异常', description: '请稍后再试' });
    } finally {
      setSubmitting(false);
    }
  }

  const active = isActiveStatus(generation?.status);
  const completedGeneration =
    generation?.status === 'COMPLETED' && generation.imageUrl ? generation : null;
  const completedImageUrl = completedGeneration?.imageUrl ?? null;
  const completed = Boolean(completedGeneration);
  const disabled = loading || submitting || active || !configured;
  const statusMessage =
    generation?.status === 'FAILED' ? generation.errorMessage || '讲解图生成失败，请重试' : message;
  const [imageWidth, imageHeight] = (generation?.imageSize ?? '1024x1536')
    .split('x')
    .map((value) => Number.parseInt(value, 10) || 1024);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={completed ? 'secondary' : 'default'}
          onClick={() => generate(Boolean(completed || generation?.status === 'FAILED'))}
          disabled={disabled}
          title={!configured ? message || '请先配置文本 AI 和生图供应商' : undefined}
        >
          {submitting || loading || active ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : completed || generation?.status === 'FAILED' ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {loading
            ? '加载讲解图...'
            : submitting
              ? '提交生成任务...'
              : generation?.status === 'PENDING'
                ? '讲解图排队中...'
                : generation?.status === 'RUNNING'
                  ? '正在生成讲解图...'
                  : completed
                    ? '重新生成讲解图'
                    : generation?.status === 'FAILED'
                      ? '重新生成讲解图'
                      : '生成讲解图'}
        </Button>
        {completed ? (
          <Button asChild variant="ghost">
            <a
              href={completedImageUrl ?? undefined}
              download={`wrong-note-${wrongNoteId}.${completedGeneration?.imageOutputFormat ?? 'webp'}`}
            >
              <Download className="h-4 w-4" />
              下载图片
            </a>
          </Button>
        ) : null}
        {generation?.status ? (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-black',
              generation.status === 'COMPLETED' && 'bg-green-100 text-green-700',
              active && 'bg-amber-100 text-amber-700',
              generation.status === 'FAILED' && 'bg-red-100 text-red-600'
            )}
          >
            {statusLabel(generation.status)}
          </span>
        ) : null}
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">
          {statusMessage}
        </p>
      ) : null}

      {completed ? (
        <Card className="mt-4 overflow-hidden bg-white p-3 hover:translate-y-0">
          <Image
            src={completedImageUrl ?? ''}
            alt="错题讲解图"
            width={imageWidth}
            height={imageHeight}
            unoptimized
            className="w-full rounded-2xl border border-orange-100 bg-white"
          />
          <p className="mt-3 text-xs font-bold text-muted">
            {completedGeneration?.provider} / {completedGeneration?.model} ·{' '}
            {completedGeneration?.imageSize} · {completedGeneration?.imageQuality}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
