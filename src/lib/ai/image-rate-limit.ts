import { prisma } from '@/lib/prisma';

type WindowState = {
  key: 'perMinute' | 'hourly' | 'daily';
  windowMs: number;
  maxCalls: number;
  calls: Map<string, number[]>;
};

const MINUTE_WINDOW_MS = 60_000;
const HOUR_WINDOW_MS = 60 * 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export const DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE = envInt('AI_IMAGE_RATE_LIMIT_PER_MINUTE', 10);
export const DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY = envInt('AI_IMAGE_RATE_LIMIT_HOURLY', 60);
export const DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY = envInt('AI_IMAGE_RATE_LIMIT_DAILY', 300);

const windows: WindowState[] = [
  {
    key: 'perMinute',
    windowMs: MINUTE_WINDOW_MS,
    maxCalls: DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE,
    calls: new Map(),
  },
  {
    key: 'hourly',
    windowMs: HOUR_WINDOW_MS,
    maxCalls: DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY,
    calls: new Map(),
  },
  {
    key: 'daily',
    windowMs: DAY_WINDOW_MS,
    maxCalls: DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY,
    calls: new Map(),
  },
];

let lastCleanup = 0;

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const window of windows) {
    const cutoff = now - window.windowMs;
    for (const [userId, timestamps] of window.calls) {
      const fresh = timestamps.filter((time) => time > cutoff);
      if (fresh.length === 0) window.calls.delete(userId);
      else if (fresh.length !== timestamps.length) window.calls.set(userId, fresh);
    }
  }
}

async function userLimits(userId: string) {
  const settings = await prisma.userAISettings.findUnique({
    where: { userId },
    select: {
      imageRateLimitPerMinute: true,
      imageRateLimitHourly: true,
      imageRateLimitDaily: true,
    },
  });
  return {
    perMinute: settings?.imageRateLimitPerMinute ?? DEFAULT_AI_IMAGE_RATE_LIMIT_PER_MINUTE,
    hourly: settings?.imageRateLimitHourly ?? DEFAULT_AI_IMAGE_RATE_LIMIT_HOURLY,
    daily: settings?.imageRateLimitDaily ?? DEFAULT_AI_IMAGE_RATE_LIMIT_DAILY,
  };
}

export async function checkAIImageRateLimit(userId: string) {
  const now = Date.now();
  cleanup(now);
  const limits = await userLimits(userId);

  const recentByWindow = windows.map((window) => {
    const cutoff = now - window.windowMs;
    const recent = (window.calls.get(userId) ?? []).filter((time) => time > cutoff);
    return { window, maxCalls: limits[window.key], recent };
  });

  if (recentByWindow.some(({ maxCalls, recent }) => maxCalls > 0 && recent.length >= maxCalls)) {
    for (const { window, recent } of recentByWindow) window.calls.set(userId, recent);
    return false;
  }

  for (const { window, recent } of recentByWindow) {
    recent.push(now);
    window.calls.set(userId, recent);
  }
  return true;
}
