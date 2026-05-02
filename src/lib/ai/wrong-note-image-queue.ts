type QueueState = {
  queue: string[];
  queuedIds: Set<string>;
  activeIds: Set<string>;
  active: number;
};

const globalKey = '__oseWrongNoteImageQueue';

function queueState(): QueueState {
  const globalWithQueue = globalThis as typeof globalThis & { [globalKey]?: QueueState };
  if (!globalWithQueue[globalKey]) {
    globalWithQueue[globalKey] = {
      queue: [],
      queuedIds: new Set(),
      activeIds: new Set(),
      active: 0,
    };
  } else if (!globalWithQueue[globalKey].activeIds) {
    globalWithQueue[globalKey].activeIds = new Set();
  }
  return globalWithQueue[globalKey];
}

function queueConcurrency() {
  const value = Number.parseInt(process.env.AI_IMAGE_QUEUE_CONCURRENCY ?? '', 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 8) : 2;
}

function schedule() {
  const state = queueState();
  const concurrency = queueConcurrency();

  while (state.active < concurrency && state.queue.length > 0) {
    const generationId = state.queue.shift();
    if (!generationId) return;
    state.queuedIds.delete(generationId);
    state.activeIds.add(generationId);
    state.active += 1;
    void import('@/lib/ai/wrong-note-image')
      .then(({ runWrongNoteImageGeneration }) => runWrongNoteImageGeneration(generationId))
      .catch(() => undefined)
      .finally(() => {
        state.active -= 1;
        state.activeIds.delete(generationId);
        schedule();
      });
  }
}

export function enqueueWrongNoteImageGeneration(generationId: string) {
  const state = queueState();
  if (state.queuedIds.has(generationId)) return;
  state.queuedIds.add(generationId);
  state.queue.push(generationId);
  schedule();
}

export function enqueueWrongNoteImageGenerations(generationIds: string[]) {
  for (const generationId of generationIds) enqueueWrongNoteImageGeneration(generationId);
}

export function getWrongNoteImageQueueStats() {
  const state = queueState();
  return {
    queued: state.queue.length,
    running: state.active,
    concurrency: queueConcurrency(),
    queuedIds: [...state.queue],
    runningIds: [...state.activeIds],
  };
}
