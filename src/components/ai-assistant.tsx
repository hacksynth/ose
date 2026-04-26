'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bot, Maximize2, Minimize2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useAIStatus } from '@/components/ai-status-context';
import { cn } from '@/lib/utils';
import { AI_CHAT_MAX_MESSAGES } from '@/lib/constants';

type Message = { role: 'user' | 'assistant'; content: string };

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const status = useAIStatus();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好，我是 OSE 智能助手。可以问我软考知识点、刷题方法或备考规划。',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, maximized]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  async function send() {
    const text = input.trim();
    if (!text || loading || !status.configured) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user' as const, content: text }].slice(
      -AI_CHAT_MAX_MESSAGES
    );
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setLoading(true);

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((message, index) =>
            index === prev.length - 1
              ? { ...message, content: data.message || 'AI 服务暂时不可用，请稍后再试。' }
              : message
          )
        );
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message, index) =>
            index === prev.length - 1 ? { ...message, content: message.content + chunk } : message
          )
        );
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      // Append to (not overwrite) the assistant message — preserves any partial stream already received.
      setMessages((prev) =>
        prev.map((message, index) => {
          if (index !== prev.length - 1) return message;
          const notice = '\n\n> 网络异常，回复可能不完整。';
          return { ...message, content: (message.content || '') + notice };
        })
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
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div
          className={cn(
            'mb-4 flex h-[500px] w-[calc(100vw-2.5rem)] flex-col rounded-[1.5rem] border border-orange-100 bg-warm shadow-lift transition-all duration-200 md:w-[380px]',
            maximized &&
              'h-[calc(100vh-2.5rem)] w-[calc(100vw-2.5rem)] md:h-[min(760px,calc(100vh-2.5rem))] md:w-[min(880px,calc(100vw-2.5rem))]'
          )}
        >
          <div className="flex items-center justify-between rounded-t-[1.5rem] bg-white/90 p-4">
            <div>
              <p className="font-black text-navy">OSE 智能助手</p>
              <p className="text-xs font-bold text-muted">
                {status.configured ? `当前供应商：${status.provider}` : '未配置 AI API Key'}
              </p>
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
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lift transition hover:scale-105 hover:bg-primary-dark"
        aria-label={open ? '收起 OSE 智能助手' : '打开 OSE 智能助手'}
      >
        <Bot className="h-7 w-7" />
      </button>
    </div>
  );
}
