import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseFiniteDate } from '@/lib/validate';
import { invalidateLearningAnalysis } from '@/lib/ai/context-cache';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, targetExamDate: true, createdAt: true },
  });
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const data: { name?: string; targetExamDate?: Date | null } = {};
  let message = '个人信息已更新';

  if ('name' in body) {
    const name = String(body.name ?? '')
      .trim()
      .slice(0, 50);
    if (!name) return NextResponse.json({ message: '用户名不能为空' }, { status: 400 });
    data.name = name;
    message = '用户名已更新';
  }

  if ('targetExamDate' in body) {
    if (body.targetExamDate === null || body.targetExamDate === '') {
      data.targetExamDate = null;
      message = '考试时间已清除';
    } else {
      const targetExamDate = parseFiniteDate(body.targetExamDate);
      if (!targetExamDate) return NextResponse.json({ message: '考试时间不合法' }, { status: 400 });
      data.targetExamDate = targetExamDate;
      message = '考试时间已更新';
    }
  }

  if (!Object.keys(data).length)
    return NextResponse.json({ message: '没有可更新的内容' }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, email: true, targetExamDate: true, createdAt: true },
  });
  if ('targetExamDate' in data) {
    invalidateLearningAnalysis(session.user.id);
  }
  return NextResponse.json({ user, message });
}
