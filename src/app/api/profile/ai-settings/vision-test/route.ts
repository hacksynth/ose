import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiSettingsError, resolveAIConfigFromRequest, testVisionCapability } from "@/lib/ai/settings";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const config = await resolveAIConfigFromRequest(session.user.id, body);
    const result = await testVisionCapability(config);

    const existing = await prisma.userAISettings.findUnique({ where: { userId: session.user.id } });
    if (existing) {
      await prisma.userAISettings.update({
        where: { userId: session.user.id },
        data: { visionSupport: result.supportsVision },
      });
    }

    return NextResponse.json({
      ok: true,
      supportsVision: result.supportsVision,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    return NextResponse.json({ message: aiSettingsError(error) }, { status: 400 });
  }
}
