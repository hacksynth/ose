type WindowState = {
  windowMs: number;
  maxCalls: number;
  calls: Map<string, number[]>;
};

const MINUTE_WINDOW_MS = 60_000;
const HOUR_WINDOW_MS = 60 * 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

const windows: WindowState[] = [
  {
    windowMs: MINUTE_WINDOW_MS,
    maxCalls: envInt('AI_IMAGE_RATE_LIMIT_PER_MINUTE', 3),
    calls: new Map(),
  },
  {
    windowMs: HOUR_WINDOW_MS,
    maxCalls: envInt('AI_IMAGE_RATE_LIMIT_HOURLY', 10),
    calls: new Map(),
  },
  { windowMs: DAY_WINDOW_MS, maxCalls: envInt('AI_IMAGE_RATE_LIMIT_DAILY', 30), calls: new Map() },
];

let lastCleanup = 0;

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

export function checkAIImageRateLimit(userId: string) {
  const now = Date.now();
  cleanup(now);

  const recentByWindow = windows.map((window) => {
    const cutoff = now - window.windowMs;
    const recent = (window.calls.get(userId) ?? []).filter((time) => time > cutoff);
    return { window, recent };
  });

  if (recentByWindow.some(({ window, recent }) => recent.length >= window.maxCalls)) {
    for (const { window, recent } of recentByWindow) window.calls.set(userId, recent);
    return false;
  }

  for (const { window, recent } of recentByWindow) {
    recent.push(now);
    window.calls.set(userId, recent);
  }
  return true;
}
