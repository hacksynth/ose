import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { aiSettingsError, resolveAIConfigFromRequest, testAIConfig } from "@/lib/ai/settings";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const config = await resolveAIConfigFromRequest(session.user.id, body);
    const result = await testAIConfig(config);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: aiSettingsError(error) }, { status: 400 });
  }
}
