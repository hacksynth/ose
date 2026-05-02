import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateLearningStable } from "@/lib/ai/context-cache";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; dayNumber: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id, dayNumber } = await params;
  const dayNumberInt = Number(dayNumber);
  if (!Number.isFinite(dayNumberInt) || dayNumberInt < 1 || !Number.isInteger(dayNumberInt)) {
    return NextResponse.json({ message: "dayNumber 参数不合法" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const plan = await prisma.studyPlan.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!plan) return NextResponse.json({ message: "计划不存在" }, { status: 404 });
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined;
  const day = await prisma.studyPlanDay.update({
    where: { studyPlanId_dayNumber: { studyPlanId: id, dayNumber: dayNumberInt } },
    data: {
      completed: Boolean(body.completed),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
  invalidateLearningStable(session.user.id);
  return NextResponse.json({ day });
}
