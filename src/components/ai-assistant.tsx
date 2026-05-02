'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bot, Maximize2, Minimize2, Plus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { OSESelect } from '@/components/ose-select';
import { useAIStatus } from '@/components/ai-status-context';
import { cn } from '@/lib/utils';
import { OSE_AI_CONTINUE_EVENT } from '@/lib/ai-chat-client';
import { AI_CHAT_MAX_MESSAGES } from '@/lib/constants';

type Message = { role: 'user' | 'assistant'; content: string };
type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

const initialMessages: Message[] = [
  {
    role: 'assistant',
    content: '你好，我是 OSE 智能助手。可以问我软考知识点、刷题方法或备考规划。',
  },
];

function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    'content' in value &&
    ['user', 'assistant'].includes(String((value as { role: unknown }).role)) &&
    typeof (value as { content: unknown }).content === 'string'
  );
}

function normalizeSession(value: unknown): ChatSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const session = value as {
    id?: unknown;
    title?: unknown;
    messages?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  if (typeof session.id !== 'string' || typeof session.title !== 'string') return null;
  return {
    id: session.id,
    title: session.title,
    messages: Array.isArray(session.messages)
      ? session.messages.filter(isMessage)
      : initialMessages,
    createdAt: typeof session.createdAt === 'string' ? session.createdAt : '',
    updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : '',
  };
}

export function AIAssistant({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [maximized, setMaximized] = useState(false);
  const status = useAIStatus();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, maximized]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  useEffect(() => {
    async function onContinueChat(event: Event) {
      const detail = (event as CustomEvent<{ title?: unknown; messages?: unknown }>).detail;
      const nextMessages = Array.isArray(detail?.messages)
        ? detail.messages.filter(isMessage).slice(-AI_CHAT_MAX_MESSAGES)
        : [];
      if (!nextMessages.length) return;
      const title =
        typeof detail?.title === 'string' && detail.title.trim() ? detail.title.trim() : '继续对话';
      cancel();
      setOpen(true);
      setActiveSessionId(null);
      setInput('');
      setMessages(nextMessages);
      await saveSession(nextMessages, title, null);
    }

    window.addEventListener(OSE_AI_CONTINUE_EVENT, onContinueChat);
    return () => window.removeEventListener(OSE_AI_CONTINUE_EVENT, onContinueChat);
  });

  useEffect(() => {
    if (!open || sessionsLoaded) return;
    let active = true;
    async function loadSessions() {
      const response = await fetch('/api/ai/chat/sessions').catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json().catch(() => ({}))) as { sessions?: unknown[] };
      const nextSessions = Array.isArray(data.sessions)
        ? data.sessions
            .map(normalizeSession)
            .filter((session): session is ChatSession => Boolean(session))
        : [];
      if (!active) return;
      setSessions(nextSessions);
      setSessionsLoaded(true);
      const latest = nextSessions[0];
      if (latest) {
        setActiveSessionId(latest.id);
        setMessages(latest.messages.length ? latest.messages : initialMessages);
      }
    }
    loadSessions();
    return () => {
      active = false;
    };
  }, [open, sessionsLoaded]);

  async function saveSession(
    nextMessages: Message[],
    titleSeed: string,
    sessionId = activeSessionId
  ) {
    const hasUserMessage = nextMessages.some((message) => message.role === 'user');
    if (!hasUserMessage) return sessionId;
    const url = sessionId ? `/api/ai/chat/sessions/${sessionId}` : '/api/ai/chat/sessions';
    const response = await fetch(url, {
      method: sessionId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleSeed, messages: nextMessages }),
    }).catch(() => null);
    if (!response?.ok) return sessionId;
    const data = (await response.json().catch(() => ({}))) as { session?: unknown };
    const saved = normalizeSession(data.session);
    if (!saved) return sessionId;
    setActiveSessionId(saved.id);
    setSessions((prev) =>
      [saved, ...prev.filter((session) => session.id !== saved.id)].slice(0, 20)
    );
    return saved.id;
  }

  function newSession() {
    cancel();
    setActiveSessionId(null);
    setInput('');
    setMessages(initialMessages);
  }

  function switchSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    cancel();
    setActiveSessionId(session.id);
    setInput('');
    setMessages(session.messages.length ? session.messages : initialMessages);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || !status.configured) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user' as const, content: text }].slice(
      -AI_CHAT_MAX_MESSAGES
    );
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setLoading(true);
    const sessionId = await saveSession(nextMessages, text);

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    let assistantContent = '';

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        const failedMessages = [
          ...nextMessages,
          {
            role: 'assistant' as const,
            content: data.message || 'AI 服务暂时不可用，请稍后再试。',
          },
        ];
        setMessages((prev) =>
          prev.map((message, index) =>
            index === prev.length - 1
              ? { ...message, content: data.message || 'AI 服务暂时不可用，请稍后再试。' }
              : message
          )
        );
        await saveSession(failedMessages, text, sessionId);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages((prev) =>
          prev.map((message, index) =>
            index === prev.length - 1 ? { ...message, content: message.content + chunk } : message
          )
        );
      }
      await saveSession(
        [...nextMessages, { role: 'assistant', content: assistantContent }],
        text,
        sessionId
      );
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      // Append to (not overwrite) the assistant message — preserves any partial stream already received.
      const notice = '\n\n> 网络异常，回复可能不完整。';
      setMessages((prev) =>
        prev.map((message, index) => {
          if (index !== prev.length - 1) return message;
          return { ...message, content: (message.content || '') + notice };
        })
      );
      await saveSession(
        [...nextMessages, { role: 'assistant', content: `${assistantContent}${notice}` }],
        text,
        sessionId
      );
    } finally {
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
      setLoading(false);
    }
  }

  function cancel() {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setLoading(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div
      className={cn(
        'fixed z-50',
        open && maximized ? 'inset-0' : 'bottom-4 right-4 md:bottom-5 md:right-5'
      )}
    >
      {open ? (
        <div
          className={cn(
            'mb-4 flex h-[min(500px,calc(100dvh-6rem))] w-[calc(100vw-2rem)] flex-col rounded-[1.5rem] border border-orange-100 bg-warm shadow-lift transition-all duration-200 md:h-[500px] md:w-[380px]',
            maximized && 'mb-0 h-screen w-screen rounded-none border-0 md:h-screen md:w-screen'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-between rounded-t-[1.5rem] bg-white/90 p-4',
              maximized && 'rounded-none'
            )}
          >
            <div>
              <p className="font-black text-navy">OSE 智能助手</p>
              <p className="text-xs font-bold text-muted">
                {status.configured ? `当前供应商：${status.provider}` : '未配置 AI API Key'}
              </p>
              <div className="mt-2 flex max-w-[230px] items-center gap-2 md:max-w-[300px]">
                <OSESelect
                  value={activeSessionId ?? ''}
                  options={sessions.map((session) => ({
                    value: session.id,
                    label: session.title,
                  }))}
                  placeholder="历史会话"
                  disabled={loading || !sessions.length}
                  triggerClassName="h-9 min-w-0 flex-1 py-2 text-xs"
                  onChange={switchSession}
                />
                <button
                  type="button"
                  onClick={newSession}
                  disabled={loading}
                  aria-label="新建会话"
                  className="rounded-full p-2 hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMaximized((value) => !value)}
                aria-label={maximized ? '还原助手窗口' : '最大化助手窗口'}
                className="rounded-full p-2 hover:bg-primary-soft"
              >
                {maximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭助手"
                className="rounded-full p-2 hover:bg-primary-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            className="flex-1 space-y-3 overflow-y-auto p-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl p-3 text-sm shadow-sm',
                    message.role === 'user' ? 'bg-primary-soft text-navy' : 'bg-white text-navy'
                  )}
                >
                  <MarkdownRenderer content={message.content || (loading ? '正在思考...' : '')} />
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-orange-100 bg-white/80 p-3">
            <div className="flex gap-2">
              <textarea
                className="ose-input min-h-12 flex-1 resize-none"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={status.configured ? '输入问题，Enter 发送' : '请先配置 AI API Key'}
                disabled={!status.configured}
                aria-label="输入消息"
              />
              {loading ? (
                <Button type="button" variant="secondary" onClick={cancel} aria-label="取消生成">
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={send}
                  disabled={!status.configured}
                  aria-label="发送消息"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {!maximized ? (
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lift transition hover:scale-105 hover:bg-primary-dark"
          aria-label={open ? '收起 OSE 智能助手' : '打开 OSE 智能助手'}
        >
          <Bot className="h-7 w-7" />
        </button>
      ) : null}
    </div>
  );
}
