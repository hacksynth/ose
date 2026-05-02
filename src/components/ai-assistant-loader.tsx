'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Bot } from 'lucide-react';

const AIAssistant = dynamic(
  () => import('@/components/ai-assistant').then((mod) => mod.AIAssistant),
  { loading: () => null, ssr: false }
);

export function AIAssistantLoader() {
  const [loaded, setLoaded] = useState(false);

  if (loaded) return <AIAssistant defaultOpen />;

  return (
    <div className="fixed bottom-4 right-4 z-50 md:bottom-5 md:right-5">
      <button
        onClick={() => setLoaded(true)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lift transition hover:scale-105 hover:bg-primary-dark"
        aria-label="打开 OSE 智能助手"
      >
        <Bot className="h-7 w-7" />
      </button>
    </div>
  );
}
