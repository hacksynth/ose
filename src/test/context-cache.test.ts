import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOrSetAnalysis,
  getOrSetStable,
  invalidateLearning,
  invalidateLearningAnalysis,
  invalidateLearningStable,
} from '@/lib/ai/context-cache';

const USER = 'cache-test-user';

afterEach(() => {
  invalidateLearning(USER);
});

describe('getOrSetAnalysis', () => {
  it('returns cached value without re-executing compute on hit', async () => {
    const compute = vi.fn().mockResolvedValue('result');
    const r1 = await getOrSetAnalysis(USER, compute);
    const r2 = await getOrSetAnalysis(USER, compute);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('re-executes compute after invalidateLearningAnalysis', async () => {
    const compute = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    await getOrSetAnalysis(USER, compute);
    invalidateLearningAnalysis(USER);
    const r2 = await getOrSetAnalysis(USER, compute);
    expect(r2).toBe('v2');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('concurrent misses coalesce to a single compute call', async () => {
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((res) => {
      resolve = res;
    });
    const compute = vi.fn().mockReturnValue(pending);

    const p1 = getOrSetAnalysis(USER, compute);
    const p2 = getOrSetAnalysis(USER, compute);
    const p3 = getOrSetAnalysis(USER, compute);

    resolve('shared');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('shared');
    expect(r2).toBe('shared');
    expect(r3).toBe('shared');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('clears inflight on compute failure so next request retries', async () => {
    const err = new Error('oops');
    const compute = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('recovered');

    await expect(getOrSetAnalysis(USER, compute)).rejects.toThrow('oops');
    const result = await getOrSetAnalysis(USER, compute);
    expect(result).toBe('recovered');
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('getOrSetStable', () => {
  it('returns cached value without re-executing compute on hit', async () => {
    const compute = vi.fn().mockResolvedValue('stable-result');
    await getOrSetStable(USER, compute);
    await getOrSetStable(USER, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('re-executes compute after invalidateLearningStable', async () => {
    const compute = vi.fn().mockResolvedValueOnce('s1').mockResolvedValueOnce('s2');
    await getOrSetStable(USER, compute);
    invalidateLearningStable(USER);
    const r = await getOrSetStable(USER, compute);
    expect(r).toBe('s2');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('concurrent misses coalesce to a single compute call', async () => {
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((res) => {
      resolve = res;
    });
    const compute = vi.fn().mockReturnValue(pending);

    const p1 = getOrSetStable(USER, compute);
    const p2 = getOrSetStable(USER, compute);

    resolve('coalesced');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('coalesced');
    expect(r2).toBe('coalesced');
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('invalidateLearning', () => {
  it('clears both analysis and stable caches', async () => {
    const aCompute = vi.fn().mockResolvedValue('a');
    const sCompute = vi.fn().mockResolvedValue('s');
    await getOrSetAnalysis(USER, aCompute);
    await getOrSetStable(USER, sCompute);

    invalidateLearning(USER);

    await getOrSetAnalysis(USER, aCompute);
    await getOrSetStable(USER, sCompute);
    expect(aCompute).toHaveBeenCalledTimes(2);
    expect(sCompute).toHaveBeenCalledTimes(2);
  });
});
