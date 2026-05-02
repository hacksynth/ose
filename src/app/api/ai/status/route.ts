import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAIStatus } from '@/lib/ai/config';

export async function GET() {
  const session = await auth();
  return NextResponse.json(await getAIStatus(session?.user?.id ?? null));
}
