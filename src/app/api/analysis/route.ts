import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAnalysis } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const userId = session.user.id;
  const analysisUser = await prisma.user.findUnique({ where: { id: userId }, select: { targetExamDate: true } });
  return NextResponse.json(await getUserAnalysis(userId, analysisUser?.targetExamDate));
}
