import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart3,
  Bot,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  GraduationCap,
  Laptop,
  LockKeyhole,
  Server,
  Sparkles,
} from 'lucide-react';

import { DecorativeBackground } from '@/components/decorative-background';
import { LandingActions } from '@/components/landing-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { auth } from '@/lib/auth';

export const metadata = {
  title: 'OSE | 开源 AI 软考备考平台',
  description: '面向中国软考软件设计师考试的开源 AI 备考平台。',
};

const repoUrl = 'https://github.com/hacksynth/ose';

const navItems = [
  { href: '#features', label: '功能' },
  { href: '#self-hosting', label: '自部署' },
  { href: `${repoUrl}/tree/main/docs`, label: '文档' },
  { href: `${repoUrl}/blob/main/CONTRIBUTING.md`, label: '贡献' },
];

const features = [
  {
    icon: GraduationCap,
    title: '智能题库',
    description: '选择题与案例分析题双模式，覆盖软件设计师考试核心考纲。',
    className: 'bg-softYellow',
  },
  {
    icon: Bot,
    title: 'AI 辅助学习',
    description: '支持讲解、批改、出题、薄弱诊断和个性化学习计划生成。',
    className: 'bg-softBlue',
  },
  {
    icon: BarChart3,
    title: '学情分析',
    description: '知识点热力图、薄弱项诊断、预测得分与通过概率评估。',
    className: 'bg-softGreen',
  },
  {
    icon: Clock3,
    title: '模拟考试',
    description: '限时考试、答题卡、自动评分与成绩报告，贴近真实考试流程。',
    className: 'bg-softRose',
  },
  {
    icon: Server,
    title: '可自部署',
    description: '支持本地运行、Docker、VPS 和反向代理部署，数据由你掌控。',
    className: 'bg-white/90',
  },
  {
    icon: LockKeyhole,
    title: '隐私优先',
    description: '学习记录和 AI Key 保存在自己的部署和数据库中。',
    className: 'bg-white/90',
  },
];

const providers = ['Claude', 'OpenAI', 'Gemini', '自定义接口'];

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <main className="ose-page px-4 pb-12 pt-4 md:px-6">
      <DecorativeBackground />
      <div className="relative z-10 mx-auto max-w-7xl space-y-8">
        <header className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/85 px-3 py-3 shadow-soft backdrop-blur md:top-4 md:rounded-[1.5rem] md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-black text-navy sm:gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-soft sm:h-11 sm:w-11">
              OSE
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-xl tracking-tight sm:text-2xl">OSE</span>
              <span className="block text-xs font-extrabold text-muted">软考 AI 备考平台</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-2xl px-4 py-2 text-sm font-extrabold text-muted transition hover:bg-primary-soft hover:text-navy"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={repoUrl}
              className="hidden items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-extrabold text-navy shadow-soft transition hover:bg-primary-soft md:inline-flex"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Star
            </a>
            <Button asChild size="sm">
              <Link href="/login">登录</Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 pt-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-primary-soft px-4 py-2 text-sm font-black text-primary">
                开源项目
              </span>
              <span className="inline-flex rounded-full bg-softGreen px-4 py-2 text-sm font-black text-navy">
                可自部署
              </span>
              <span className="inline-flex rounded-full bg-softBlue px-4 py-2 text-sm font-black text-navy">
                Web + 桌面端
              </span>
            </div>
            <h1 className="max-w-4xl text-3xl font-black leading-tight tracking-tight text-navy sm:text-4xl md:text-6xl">
              像专业学习工作台一样备考软考。
            </h1>
            <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-muted sm:text-lg">
              OSE 面向软件设计师考试，把题库练习、案例分析、模拟考试、错题复盘、学情诊断和 AI
              辅助整合到一个开源、可自部署的备考平台中。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LandingActions />
              <Button asChild variant="secondary" size="lg">
                <a href={repoUrl}>
                  <ExternalLink className="h-5 w-5" aria-hidden="true" />
                  查看 GitHub
                </a>
              </Button>
            </div>
          </div>

          <Card className="flex flex-col justify-between bg-navy p-6 text-white hover:translate-y-0 sm:p-8">
            <div>
              <p className="text-sm font-black text-white/60">平台预览</p>
              <h2 className="mt-3 text-4xl font-black sm:text-5xl">
                78<span className="ml-1 text-xl">%</span>
              </h2>
              <p className="mt-2 font-bold text-white/70">预计通过概率</p>
            </div>
            <div className="mt-8 rounded-[1.25rem] bg-white/10 p-5">
              <Sparkles className="mb-4 h-8 w-8 text-softYellow" aria-hidden="true" />
              <p className="font-bold text-white/80">
                练习、诊断、AI 反馈和学习计划集中在一个高效的学习工作台中。
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: '题库题目',
              value: '35+',
              unit: '道',
              icon: GraduationCap,
              className: 'bg-softYellow',
            },
            {
              label: '题型覆盖',
              value: '2',
              unit: '类',
              icon: CheckCircle2,
              className: 'bg-softBlue',
            },
            { label: '知识模块', value: '10', unit: '个', icon: Brain, className: 'bg-softGreen' },
            {
              label: 'AI 供应商',
              value: '4',
              unit: '种',
              icon: Sparkles,
              className: 'bg-softRose',
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={`p-6 ${stat.className}`}>
                <div className="flex items-center justify-between">
                  <p className="font-black text-muted">{stat.label}</p>
                  <span className="rounded-2xl bg-white/70 p-3">
                    <Icon className="h-5 w-5 text-navy" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-6 text-4xl font-black text-navy sm:text-5xl">
                  {stat.value}
                  <span className="ml-1 text-xl">{stat.unit}</span>
                </p>
              </Card>
            );
          })}
        </section>

        <section id="features" className="grid gap-6 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className={`p-7 hover:translate-y-0 ${feature.className}`}>
                <Icon className="h-10 w-10 text-primary" aria-hidden="true" />
                <h2 className="mt-6 text-2xl font-black text-navy">{feature.title}</h2>
                <p className="mt-3 font-semibold leading-7 text-muted">{feature.description}</p>
              </Card>
            );
          })}
        </section>

        <section id="self-hosting" className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <Card className="bg-white/90 p-7 hover:translate-y-0">
            <Database className="h-10 w-10 text-primary" aria-hidden="true" />
            <h2 className="mt-6 text-2xl font-black text-navy">默认支持自部署</h2>
            <p className="mt-3 font-semibold leading-7 text-muted">
              本地可用 SQLite，生产可切换 PostgreSQL，也可以用 Docker、VPS 或 Tauri 桌面版运行。
            </p>
            <Button asChild className="mt-6">
              <a href={`${repoUrl}/tree/main/docs`}>查看文档</a>
            </Button>
          </Card>

          <Card className="bg-white/90 p-7 hover:translate-y-0">
            <h2 className="text-2xl font-black text-navy">接入你偏好的 AI 模型</h2>
            <p className="mt-3 font-semibold leading-7 text-muted">
              托管大模型和 OpenAI 兼容本地接口共用同一套供应商抽象，便于按成本、质量和隐私要求切换。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {providers.map((provider) => (
                <div key={provider} className="rounded-2xl bg-warm p-4 font-black text-navy">
                  {provider}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-2xl bg-primary-soft px-4 py-2 text-sm font-black text-primary">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                隐私优先
              </span>
              <span className="inline-flex items-center gap-2 rounded-2xl bg-softGreen px-4 py-2 text-sm font-black text-navy">
                <Laptop className="h-4 w-4" aria-hidden="true" />
                桌面可用
              </span>
              <span className="inline-flex items-center gap-2 rounded-2xl bg-softYellow px-4 py-2 text-sm font-black text-navy">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                学习计划
              </span>
            </div>
          </Card>
        </section>

        <section className="rounded-[1.5rem] bg-white/90 p-6 shadow-soft backdrop-blur sm:rounded-[2rem] sm:p-8 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="inline-flex rounded-full bg-primary-soft px-4 py-2 text-sm font-black text-primary">
                由社区共同驱动
              </p>
              <h2 className="mt-5 text-3xl font-black text-navy">为考生、老师和开发者共同打造。</h2>
              <p className="mt-3 max-w-2xl font-semibold leading-7 text-muted">
                你可以贡献题库、部署方案、AI 提示词、无障碍体验、文档和更多软考科目支持。
              </p>
            </div>
            <Button asChild size="lg">
              <a href={`${repoUrl}/blob/main/CONTRIBUTING.md`}>
                <ExternalLink className="h-5 w-5" aria-hidden="true" />
                参与贡献
              </a>
            </Button>
          </div>
          <div className="mt-8 flex -space-x-2">
            {['题库', 'AI', '部署', '体验', '测试', '文档'].map((name) => (
              <div
                key={name}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-navy text-xs font-black text-white"
                aria-label={`贡献者占位 ${name}`}
              >
                {name}
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-4 rounded-[1.5rem] bg-white/70 px-5 py-5 text-sm font-bold text-muted shadow-soft backdrop-blur md:flex-row md:items-center md:justify-between">
          <p>OSE - Open Software Exam</p>
          <div className="flex flex-wrap gap-4">
            <a href={repoUrl} className="transition hover:text-primary">
              GitHub
            </a>
            <a href={`${repoUrl}/tree/main/docs`} className="transition hover:text-primary">
              文档
            </a>
            <a
              href={`${repoUrl}/blob/main/CONTRIBUTING.md`}
              className="transition hover:text-primary"
            >
              参与贡献
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
