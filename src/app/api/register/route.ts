import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { isValidEmail } from '@/lib/validate';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const password = String(body?.password ?? '');
  const name = String(body?.name ?? '')
    .trim()
    .slice(0, 50);

  if (!email || !password || !name) {
    return NextResponse.json({ message: '请填写姓名、邮箱和密码' }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ message: '邮箱格式不正确' }, { status: 400 });
  }

  if (password.length < 6 || password.length > 128) {
    return NextResponse.json({ message: '密码长度需在 6-128 位之间' }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  try {
    await prisma.user.create({
      data: { email, name, password: hashedPassword },
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ message: '该邮箱已注册' }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ message: '注册成功' }, { status: 201 });
}
