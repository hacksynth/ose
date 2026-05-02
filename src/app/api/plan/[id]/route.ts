import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAllowedEnum } from "@/lib/validate";
import { invalidateLearningStable } from "@/lib/ai/context-cache";

const PLAN_STATUS = ["ACTIVE", "COMPLETED", "ABANDONED"] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.studyPlan.findFirst({ where: { id, userId: session.user.id }, include: { days: { orderBy: { dayNumber: "asc" } } } });
  if (!plan) return NextResponse.json({ message: "计划不存在" }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!isAllowedEnum(body.status, PLAN_STATUS)) {
    return NextResponse.json({ message: "status 参数不合法" }, { status: 400 });
  }
  const result = await prisma.studyPlan.updateMany({ where: { id, userId: session.user.id }, data: { status: body.status } });
  if (result.count === 0) return NextResponse.json({ message: "计划不存在" }, { status: 404 });
  const updated = await prisma.studyPlan.findUnique({ where: { id } });
  invalidateLearningStable(session.user.id);
  return NextResponse.json({ plan: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.studyPlan.deleteMany({ where: { id, userId: session.user.id } });
  if (result.count === 0) return NextResponse.json({ message: "计划不存在" }, { status: 404 });
  invalidateLearningStable(session.user.id);
  return NextResponse.json({ success: true });
}
