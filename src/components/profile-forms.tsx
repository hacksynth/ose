'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileForms({
  initialName,
  initialTargetExamDate,
}: {
  initialName: string;
  initialTargetExamDate?: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [targetExamDate, setTargetExamDate] = useState(initialTargetExamDate ?? '');
  const [message, setMessage] = useState('');
  const [loadingName, setLoadingName] = useState(false);
  const [loadingExamDate, setLoadingExamDate] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingName(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.slice(0, 50) }),
      });
      const json = await response.json().catch(() => ({}));
      setMessage(json.message || (response.ok ? '用户名已更新' : '更新失败'));
    } catch {
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoadingName(false);
    }
  }

  async function updateExamDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingExamDate(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetExamDate: targetExamDate || null }),
      });
      const json = await response.json().catch(() => ({}));
      setMessage(json.message || (response.ok ? '考试时间已更新' : '更新失败'));
    } catch {
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoadingExamDate(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const oldPassword = String(form.get('oldPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword.length < 6 || newPassword.length > 128) {
      setMessage('新密码长度需在 6-128 位之间');
      return;
    }
    setLoadingPassword(true);
    try {
      const response = await fetch('/api/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const json = await response.json().catch(() => ({}));
      setMessage(json.message || (response.ok ? '密码已更新' : '修改失败'));
      if (response.ok) formEl.reset();
    } catch {
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoadingPassword(false);
    }
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p className="rounded-2xl bg-primary-soft px-4 py-3 text-sm font-black text-primary">
          {message}
        </p>
      ) : null}
      <form onSubmit={updateName} className="rounded-3xl bg-white p-5 shadow-soft">
        <Label htmlFor="name">修改用户名</Label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
          />
          <Button disabled={loadingName}>
            {loadingName ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存
          </Button>
        </div>
      </form>
      <form onSubmit={updateExamDate} className="rounded-3xl bg-white p-5 shadow-soft">
        <Label htmlFor="targetExamDate">目标考试时间</Label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input
            id="targetExamDate"
            type="date"
            value={targetExamDate}
            onChange={(event) => setTargetExamDate(event.target.value)}
          />
          <Button disabled={loadingExamDate}>
            {loadingExamDate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存
          </Button>
        </div>
        <p className="mt-2 text-sm font-semibold text-muted">
          用于仪表盘倒计时和生成学习计划的默认日期。
        </p>
      </form>
      <form onSubmit={updatePassword} className="rounded-3xl bg-white p-5 shadow-soft">
        <Label>修改密码</Label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            name="oldPassword"
            type="password"
            placeholder="旧密码"
            required
            minLength={6}
            maxLength={128}
          />
          <Input
            name="newPassword"
            type="password"
            placeholder="新密码（至少 6 位）"
            required
            minLength={6}
            maxLength={128}
          />
        </div>
        <Button className="mt-3" disabled={loadingPassword}>
          {loadingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}更新密码
        </Button>
      </form>
    </div>
  );
}
