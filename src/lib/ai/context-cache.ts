const ANALYSIS_TTL_MS = 60_000;
const STABLE_TTL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const analysisCache = new Map<string, CacheEntry<unknown>>();
const stableCache = new Map<string, CacheEntry<unknown>>();
const inflightAnalysis = new Map<string, Promise<unknown>>();
const inflightStable = new Map<string, Promise<unknown>>();
let lastCleanup = 0;

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of analysisCache) {
    if (entry.expiresAt <= now) analysisCache.delete(key);
  }
  for (const [key, entry] of stableCache) {
    if (entry.expiresAt <= now) stableCache.delete(key);
  }
}

export async function getOrSetAnalysis<T>(userId: string, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  cleanup(now);
  const key = `analysis:${userId}`;
  const cached = analysisCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  const existing = inflightAnalysis.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = compute().then(
    (value) => {
      analysisCache.set(key, { value, expiresAt: Date.now() + ANALYSIS_TTL_MS });
      inflightAnalysis.delete(key);
      return value;
    },
    (err: unknown) => {
      inflightAnalysis.delete(key);
      throw err;
    },
  );
  inflightAnalysis.set(key, promise);
  return promise;
}

export async function getOrSetStable<T>(userId: string, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  cleanup(now);
  const key = `stable:${userId}`;
  const cached = stableCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  const existing = inflightStable.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = compute().then(
    (value) => {
      stableCache.set(key, { value, expiresAt: Date.now() + STABLE_TTL_MS });
      inflightStable.delete(key);
      return value;
    },
    (err: unknown) => {
      inflightStable.delete(key);
      throw err;
    },
  );
  inflightStable.set(key, promise);
  return promise;
}

export function invalidateLearningAnalysis(userId: string) {
  analysisCache.delete(`analysis:${userId}`);
}

export function invalidateLearningStable(userId: string) {
  stableCache.delete(`stable:${userId}`);
}

export function invalidateLearning(userId: string) {
  invalidateLearningAnalysis(userId);
  invalidateLearningStable(userId);
}
