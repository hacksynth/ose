'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2, PencilLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OSESelect } from '@/components/ose-select';
import { cn } from '@/lib/utils';
import { useAIStatus } from '@/components/ai-status-context';

type KnowledgePoint = { id: string; name: string; children: Array<{ id: string; name: string }> };
type HistoryItem = {
  id: string;
  type: string;
  knowledgePointNames: string;
  difficulty: number;
  count: number;
  caseType?: string | null;
  createdAt: string;
  questionIds: unknown;
};

const caseTypes = ['随机', '数据流图', '数据库设计', 'UML', '算法', '面向对象设计'];
const counts = [5, 10, 15, 20];

function stars(value: number, onChange: (value: number) => void) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            'text-3xl transition hover:scale-110',
            item <= value ? 'text-primary' : 'text-orange-100'
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function AIGenerateClient({
  knowledgeTree,
  history,
  weakIds,
}: {
  knowledgeTree: KnowledgePoint[];
  history: HistoryItem[];
  weakIds: string[];
}) {
  const router = useRouter();
  const aiStatus = useAIStatus();
  const [tab, setTab] = useState<'choice' | 'case'>('choice');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(3);
  const [count, setCount] = useState(5);
  const [caseType, setCaseType] = useState('随机');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flatKnowledge = useMemo(
    () => knowledgeTree.flatMap((root) => [root, ...root.children]),
    [knowledgeTree]
  );

  function toggleId(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function useWeakMode() {
    setTab('choice');
    setSelectedIds(weakIds.slice(0, 3));
    setDifficulty(3);
  }

  async function start(questionIds: string[]) {
    const response = await fetch('/api/practice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ai', questionIds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '无法开始练习');
    sessionStorage.setItem(`ose-practice-${data.sessionId}`, JSON.stringify(data.questions));
    router.push(`/practice/session?sessionId=${data.sessionId}`);
  }

  async function generate() {
    if (loading) return;
    if (!aiStatus.configured) {
      setError('AI 未配置，请先在个人中心填入 API Key');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (tab === 'choice') {
        const response = await fetch('/api/ai/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledgePointIds: selectedIds, difficulty, count }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'AI 出题失败');
        await start(data.questionIds);
      } else {
        const response = await fetch('/api/ai/generate-case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseType, difficulty }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'AI 出题失败');
        router.push(`/practice/case/${data.questionId}`);
      }
      // On success the router navigates away and this component unmounts;
      // leaving loading=true is harmless, but reset for robustness.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI 出题失败');
      setLoading(false);
    }
  }

  function rerun(item: HistoryItem) {
    setTab(item.type === 'CASE_ANALYSIS' ? 'case' : 'choice');
    setDifficulty(item.difficulty);
    setCount(Math.min(20, Math.max(5, item.count)));
    if (item.caseType) setCaseType(item.caseType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="mx-auto mt-6 max-w-7xl space-y-6 md:mt-8 md:space-y-8">
      <section className="rounded-[1.5rem] bg-gradient-to-br from-softYellow via-white to-softRose p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="mb-3 text-sm font-black text-primary">AI Question Studio</p>
            <h1 className="text-3xl font-black text-navy sm:text-4xl md:text-5xl">AI 智能出题</h1>
            <p className="mt-3 font-semibold text-muted">
              按知识点定制选择题，或让 AI 生成下午案例分析题。
            </p>
          </div>
          <Sparkles className="h-16 w-16 text-primary" />
        </div>
      </section>

      <Card className="p-5 hover:translate-y-0 sm:p-7">
        <div className="mb-6 grid gap-3 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant={tab === 'choice' ? 'default' : 'secondary'}
            onClick={() => setTab('choice')}
          >
            选择题
          </Button>
          <Button
            type="button"
            variant={tab === 'case' ? 'default' : 'secondary'}
            onClick={() => setTab('case')}
          >
            案例分析题
          </Button>
          <Button type="button" variant="secondary" onClick={useWeakMode}>
            <Bot className="h-4 w-4" />
            薄弱强化
          </Button>
        </div>
        {tab === 'choice' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 font-black text-navy">知识点范围</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-black',
                    selectedIds.length === 0
                      ? 'bg-primary text-white'
                      : 'bg-primary-soft text-primary'
                  )}
                >
                  全部
                </button>
                {flatKnowledge.map((kp) => (
                  <button
                    key={kp.id}
                    type="button"
                    onClick={() => toggleId(kp.id)}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-black',
                      selectedIds.includes(kp.id)
                        ? 'bg-primary text-white'
                        : 'bg-white text-navy shadow-sm'
                    )}
                  >
                    {kp.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <p className="mb-2 font-black text-navy">难度等级</p>
                {stars(difficulty, setDifficulty)}
              </div>
              <label className="block font-black text-navy">
                生成数量
                <OSESelect
                  value={String(count)}
                  options={counts.map((item) => ({ value: String(item), label: `${item}题` }))}
                  triggerClassName="mt-2"
                  onChange={(nextValue) => setCount(Number(nextValue))}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <label className="block font-black text-navy">
              题型方向
              <OSESelect
                value={caseType}
                options={caseTypes.map((item) => ({ value: item, label: item }))}
                triggerClassName="mt-2"
                onChange={setCaseType}
              />
            </label>
            <div>
              <p className="mb-2 font-black text-navy">难度等级</p>
              {stars(difficulty, setDifficulty)}
            </div>
          </div>
        )}
        {error ? (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="mt-6 rounded-3xl bg-softYellow p-6 text-center">
            <PencilLine className="mx-auto h-10 w-10 animate-bounce text-primary" />
            <p className="mt-3 text-xl font-black text-navy">AI 正在出题...</p>
            <p className="mt-1 font-semibold text-muted">正在贴近真题风格生成内容，请稍等。</p>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-7 w-full sm:w-auto"
            onClick={generate}
            disabled={!aiStatus.configured}
            title={!aiStatus.configured ? 'AI 未配置，请先在个人中心填入 API Key' : undefined}
          >
            <Sparkles className="h-5 w-5" />
            开始出题
          </Button>
        )}
        {!aiStatus.configured ? (
          <p className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-bold text-primary">
            AI 未配置。请前往个人中心或设置环境变量以启用 AI 出题。
          </p>
        ) : null}
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-black text-navy sm:text-3xl">出题历史</h2>
        {history.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {history.map((item) => (
              <Card key={item.id} className="p-5 hover:translate-y-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-black text-navy">
                      {item.type === 'CASE_ANALYSIS' ? '案例分析题' : '选择题'} ·{' '}
                      {item.knowledgePointNames}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-muted">
                      {new Intl.DateTimeFormat('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.createdAt))}{' '}
                      · 难度 {item.difficulty} · {item.count} 题
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => rerun(item)}
                    className="w-full sm:w-auto"
                  >
                    再来一组
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-center font-semibold text-muted hover:translate-y-0">
            还没有 AI 出题记录，先生成一组试试看。
          </Card>
        )}
      </section>
    </main>
  );
}
