'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AIExplainButton } from '@/components/ai-explain-button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { OSESelect } from '@/components/ose-select';
import { showToast } from '@/lib/toast-client';
import { WRONG_NOTE_PREVIEW_LENGTH } from '@/lib/constants';

type Topic = { id: string; name: string; parentId?: string | null };
type WrongItem = {
  id: string;
  markedMastered: boolean;
  lastWrongAt: string;
  wrongCount: number;
  wrongOptionId?: string;
  correctOption?: { id: string; label: string; content: string };
  question: {
    id: string;
    content: string;
    explanation: string;
    knowledgePoint: { name: string; parent?: { name: string } | null };
    options: Array<{ id: string; label: string; content: string }>;
  };
};
type WrongNotesResponse = {
  stats: { total: number; unmastered: number; mastered: number };
  topics: Topic[];
  items: WrongItem[];
  pagination: { page: number; totalPages: number; total: number };
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function WrongNotesClient() {
  const router = useRouter();
  const [data, setData] = useState<WrongNotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const queryString = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        pageSize: '20',
        status,
        ...(topic ? { knowledgePointId: topic } : {}),
      }).toString(),
    [page, status, topic]
  );
  const loadControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/wrong-notes?${queryString}`, {
        signal: controller.signal,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast({ title: '错题加载失败', description: json.message || '请稍后重试' });
        return;
      }
      setData(json);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      showToast({ title: '网络异常', description: '请稍后再试' });
    } finally {
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const patchNote = useCallback(
    async (id: string, markedMastered: boolean) => {
      setData((prev) => {
        if (!prev) return prev;
        const delta = markedMastered ? 1 : -1;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            mastered: Math.max(0, prev.stats.mastered + delta),
            unmastered: Math.max(0, prev.stats.unmastered - delta),
          },
          items: prev.items.map((item) => (item.id === id ? { ...item, markedMastered } : item)),
        };
      });
      try {
        const response = await fetch(`/api/wrong-notes/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markedMastered }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast({ title: '操作失败', description: json.message || '请稍后重试' });
          await load();
          return;
        }
        showToast({ title: '状态已更新' });
      } catch {
        showToast({ title: '网络异常', description: '请稍后再试' });
        await load();
      }
    },
    [load]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!confirm('确定从错题本移除这道题吗？')) return;
      setData((prev) => {
        if (!prev) return prev;
        const target = prev.items.find((item) => item.id === id);
        if (!target) return prev;
        return {
          ...prev,
          stats: {
            total: Math.max(0, prev.stats.total - 1),
            mastered: target.markedMastered
              ? Math.max(0, prev.stats.mastered - 1)
              : prev.stats.mastered,
            unmastered: target.markedMastered
              ? prev.stats.unmastered
              : Math.max(0, prev.stats.unmastered - 1),
          },
          items: prev.items.filter((item) => item.id !== id),
          pagination: { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) },
        };
      });
      try {
        const response = await fetch(`/api/wrong-notes/${id}`, { method: 'DELETE' });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast({ title: '删除失败', description: json.message || '请稍后重试' });
          await load();
          return;
        }
        showToast({ title: '已从错题本移除' });
      } catch {
        showToast({ title: '网络异常', description: '请稍后再试' });
        await load();
      }
    },
    [load]
  );

  async function retryAll() {
    try {
      const response = await fetch('/api/wrong-notes/retry', { method: 'POST' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast({ title: '错题重练', description: json.message || '暂无可重练错题' });
        return;
      }
      sessionStorage.setItem(`ose-practice-${json.sessionId}`, JSON.stringify(json.questions));
      router.push(`/practice/session?sessionId=${json.sessionId}`);
    } catch {
      showToast({ title: '网络异常', description: '请稍后再试' });
    }
  }

  // Group topics by parent so the filter select reflects the tree structure.
  const topicGroups = useMemo(() => {
    const topics = data?.topics ?? [];
    const byId = new Map(topics.map((item) => [item.id, item]));
    const roots = topics.filter((item) => !item.parentId);
    return roots
      .map((root) => ({
        root,
        children: topics.filter((item) => item.parentId === root.id),
      }))
      .filter((group) => group.root && byId.has(group.root.id));
  }, [data?.topics]);
  const topicSelectGroups = useMemo(
    () =>
      topicGroups.map((group) => ({
        label: group.root.name,
        options: [
          { value: group.root.id, label: `${group.root.name}（整体）` },
          ...group.children.map((child) => ({ value: child.id, label: child.name })),
        ],
      })),
    [topicGroups]
  );

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8">
      <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-sm font-black text-primary">Wrong Notes</p>
            <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">错题本</h1>
            <p className="mt-3 font-semibold text-muted">把每一次错误变成下一次得分。</p>
          </div>
          <Button onClick={retryAll} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4" />
            错题重练
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="bg-softYellow p-6">
          <p className="font-black text-muted">总错题数</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">{data?.stats.total ?? 0}</p>
        </Card>
        <Card className="bg-softRose p-6">
          <p className="font-black text-muted">未掌握</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data?.stats.unmastered ?? 0}
          </p>
        </Card>
        <Card className="bg-softGreen p-6">
          <p className="font-black text-muted">已掌握</p>
          <p className="mt-3 text-4xl font-black text-navy sm:text-5xl">
            {data?.stats.mastered ?? 0}
          </p>
        </Card>
      </section>

      <Card className="p-5 hover:translate-y-0">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-black text-navy">知识点</span>
            <OSESelect
              value={topic}
              options={[{ value: '', label: '全部知识点' }]}
              groups={topicSelectGroups}
              onChange={(nextTopic) => {
                setTopic(nextTopic);
                setPage(1);
              }}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-black text-navy">状态</span>
            <OSESelect
              value={status}
              options={[
                { value: 'all', label: '全部' },
                { value: 'unmastered', label: '未掌握' },
                { value: 'mastered', label: '已掌握' },
              ]}
              onChange={(nextStatus) => {
                setStatus(nextStatus);
                setPage(1);
              }}
            />
          </label>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center font-black text-muted">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
          正在加载错题...
        </Card>
      ) : null}
      {!loading && data && data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-5xl" role="img" aria-label="开心">
            😊
          </div>
          <h2 className="mt-4 text-3xl font-black text-navy">还没有错题，继续保持！</h2>
          <p className="mt-2 font-semibold text-muted">多练习、多复盘，状态会越来越稳。</p>
        </Card>
      ) : null}
      <div className="space-y-4">
        {data?.items.map((item) => (
          <WrongNoteRow key={item.id} item={item} onToggle={patchNote} onDelete={deleteNote} />
        ))}
      </div>
      {data && data.pagination.totalPages > 1 ? (
        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </Button>
          <span className="rounded-2xl bg-white px-4 py-3 font-black text-muted" aria-live="polite">
            {page}/{data.pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </main>
  );
}

type RowProps = {
  item: WrongItem;
  onToggle: (id: string, mastered: boolean) => void;
  onDelete: (id: string) => void;
};

const WrongNoteRow = memo(function WrongNoteRow({ item, onToggle, onDelete }: RowProps) {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<{
    isCorrect: boolean;
    correctOptionId: string;
    explanation: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryStartedAt, setRetryStartedAt] = useState<number>(() => Date.now());
  const topicName = `${item.question.knowledgePoint.parent?.name ?? item.question.knowledgePoint.name} · ${item.question.knowledgePoint.name}`;
  const preview =
    item.question.content.length > WRONG_NOTE_PREVIEW_LENGTH
      ? `${item.question.content.slice(0, WRONG_NOTE_PREVIEW_LENGTH)}...`
      : item.question.content;

  async function submitRetry() {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const timeSpent = Math.max(1, Math.floor((Date.now() - retryStartedAt) / 1000));
      const response = await fetch('/api/practice/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: item.question.id,
          selectedOptionId: selected,
          timeSpent,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        setResult(json);
      } else {
        showToast({ title: '提交失败', description: json.message || '请稍后重试' });
      }
    } catch {
      showToast({ title: '网络异常', description: '请稍后再试' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5 hover:translate-y-0">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">
              {topicName}
            </span>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-black',
                item.markedMastered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              )}
            >
              {item.markedMastered ? '已掌握' : '未掌握'}
            </span>
          </div>
          <h2 className="font-black leading-relaxed text-navy">{preview}</h2>
          <p className="mt-2 text-sm font-semibold text-muted">
            做错 {item.wrongCount} 次 · 最近做错 {formatTime(item.lastWrongAt)}
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? '收起详情' : '展开详情'}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}详情
          </Button>
          <Button
            variant="secondary"
            onClick={() => onToggle(item.id, !item.markedMastered)}
            aria-pressed={item.markedMastered}
          >
            {item.markedMastered ? '取消掌握' : '标记已掌握'}
          </Button>
          <Button variant="ghost" onClick={() => onDelete(item.id)} aria-label="从错题本删除">
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-6 border-t border-orange-100 pt-6">
          <MarkdownRenderer
            content={item.question.content}
            className="text-xl font-black leading-relaxed text-navy [&_img]:my-3 [&_img]:rounded-2xl"
          />
          <div className="mt-5 grid gap-3">
            {item.question.options.map((option) => {
              const isWrong = option.id === item.wrongOptionId;
              const isCorrect = option.id === item.correctOption?.id;
              const retrySelected = option.id === selected;
              const retryCorrect = result?.correctOptionId === option.id;
              const retryWrong = result && retrySelected && !result.isCorrect;
              return (
                <button
                  key={option.id}
                  disabled={!retrying || Boolean(result)}
                  onClick={() => setSelected(option.id)}
                  className={cn(
                    'rounded-2xl border-2 bg-white p-4 text-left font-bold transition',
                    isWrong && !retrying && 'border-red-300 bg-red-50 text-red-700',
                    isCorrect && !retrying && 'border-green-300 bg-green-50 text-green-700',
                    retrySelected && !result && 'border-primary bg-primary-soft',
                    retryCorrect && result && 'border-green-300 bg-green-50 text-green-700',
                    retryWrong && 'border-red-300 bg-red-50 text-red-700'
                  )}
                >
                  {option.label}. {option.content}
                </button>
              );
            })}
          </div>
          {!retrying ? (
            <div className="mt-5 rounded-3xl bg-white p-5 shadow-soft">
              <p className="font-black text-navy">解析</p>
              <p className="mt-2 font-semibold leading-7 text-muted">{item.question.explanation}</p>
              <AIExplainButton
                questionId={item.question.id}
                userAnswerOptionId={item.wrongOptionId}
              />
            </div>
          ) : null}
          {result ? (
            <div className="mt-5 rounded-3xl bg-white p-5 shadow-soft">
              <p className="flex items-center gap-2 font-black text-navy">
                {result.isCorrect ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                {result.isCorrect ? '重练答对了，可以标记掌握' : '这次仍然答错，继续留在错题本'}
              </p>
              <p className="mt-2 font-semibold leading-7 text-muted">{result.explanation}</p>
              {result.isCorrect ? (
                <Button className="mt-4" onClick={() => onToggle(item.id, true)}>
                  标记已掌握
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 sm:flex">
            {retrying ? (
              <Button onClick={submitRetry} disabled={!selected || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}提交重练
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setRetrying(true);
                  setResult(null);
                  setSelected('');
                  setRetryStartedAt(Date.now());
                }}
              >
                重新作答
              </Button>
            )}
            {retrying ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setRetrying(false);
                  setResult(null);
                  setSelected('');
                }}
              >
                查看答案
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
});
