import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateLearning } from "@/lib/ai/context-cache";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const note = await prisma.wrongNote.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ message: "错题不存在" }, { status: 404 });

  const trimmedNote = typeof body.note === "string" ? body.note.slice(0, 2000) : undefined;

  const updated = await prisma.wrongNote.update({
    where: { id },
    data: {
      ...(typeof body.markedMastered === "boolean" ? { markedMastered: body.markedMastered } : {}),
      ...(trimmedNote !== undefined ? { note: trimmedNote } : {}),
    },
  });
  invalidateLearning(session.user.id);
  return NextResponse.json({ item: updated, message: "错题状态已更新" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.wrongNote.deleteMany({ where: { id, userId: session.user.id } });
  if (result.count === 0) return NextResponse.json({ message: "错题不存在" }, { status: 404 });
  invalidateLearning(session.user.id);
  return NextResponse.json({ message: "已从错题本移除" });
}
