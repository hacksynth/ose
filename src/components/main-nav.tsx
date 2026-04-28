'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BookOpenCheck, LogOut, Menu, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/practice', label: '练习' },
  { href: '/knowledge', label: '知识点' },
  { href: '/exam', label: '模拟考试' },
  { href: '/plan', label: '学习计划' },
  { href: '/analysis', label: '学情诊断' },
  { href: '/wrong-notes', label: '错题本' },
  { href: '/profile', label: '个人中心' },
];

export function MainNav({ userName, userEmail }: { userName: string; userEmail?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const initial = userName?.slice(0, 1).toUpperCase() || 'O';

  async function handleSignOut() {
    try {
      await signOut({ redirect: false });
    } catch {
      // proceed to redirect even on network hiccup
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-2 z-40 mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/85 px-3 py-3 shadow-soft backdrop-blur md:top-4 md:rounded-[1.5rem] md:px-6">
      <Link
        href="/dashboard"
        className="flex min-w-0 items-center gap-2 font-black text-navy sm:gap-3"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-soft sm:h-11 sm:w-11">
          <BookOpenCheck className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-xl tracking-tight sm:text-2xl">OSE</span>
          <span className="block truncate text-xs font-extrabold text-muted">软考备考</span>
        </span>
      </Link>

      <nav className="hidden items-center gap-2 md:flex">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-2xl px-4 py-2 text-sm font-extrabold text-muted transition hover:bg-primary-soft hover:text-navy',
                active && 'bg-primary-soft text-primary ring-2 ring-primary/10'
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl p-1 transition hover:bg-primary-soft sm:gap-3"
            aria-label="打开用户菜单"
          >
            <Avatar>
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <Menu className="h-5 w-5 text-muted md:hidden" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <span className="block text-navy">{userName}</span>
            <span className="font-semibold">{userEmail}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserRound className="mr-2 h-4 w-4" />
              个人中心
            </Link>
          </DropdownMenuItem>
          <div className="md:hidden">
            {navItems
              .filter((item) => item.href !== '/profile')
              .map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start p-0 font-extrabold"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" /> 退出登录
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
