import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DecorativeBackground } from '@/components/decorative-background';

export default function NotFound() {
  return (
    <main className="ose-page flex min-h-screen items-center justify-center px-5">
      <DecorativeBackground />
      <div className="relative z-10 max-w-xl rounded-[1.5rem] bg-white/90 p-6 text-center shadow-soft sm:rounded-[2rem] sm:p-10">
        <div className="text-5xl sm:text-6xl">🌱</div>
        <h1 className="mt-5 text-3xl font-black text-navy sm:text-5xl">页面走丢啦</h1>
        <p className="mt-4 font-semibold leading-8 text-muted">
          没关系，学习路上偶尔迷路也很正常。回到仪表盘继续今天的进步吧。
        </p>
        <Button asChild className="mt-6 w-full sm:w-auto">
          <Link href="/dashboard">回到学习首页</Link>
        </Button>
      </div>
    </main>
  );
}
