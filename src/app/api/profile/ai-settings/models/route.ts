import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { aiSettingsError, listAIModels, resolveAIConfigFromRequest } from "@/lib/ai/settings";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const config = await resolveAIConfigFromRequest(session.user.id, body);
    const models = await listAIModels(config);
    return NextResponse.json({ provider: config.provider, models });
  } catch (error) {
    return NextResponse.json({ message: aiSettingsError(error) }, { status: 400 });
  }
}
