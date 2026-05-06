import type {
  OptimizationCandidate, OptimizationInput, OptimizationResult,
} from './types';

export interface RunHandle {
  promise: Promise<OptimizationResult>;
  cancel(): void;
  onProgress?: (phase: string, candidate: number) => void;
}

/**
 * Minimal Worker-like surface the pool needs. Real `Worker` satisfies it.
 * Tests can inject an inline implementation.
 */
export interface PoolWorker {
  postMessage(msg: unknown): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}

export interface RunOptimizerOptions {
  onProgress?: (phase: string, candidate: number) => void;
  /** Test seam: build a worker. Default uses `new Worker(new URL('./worker.ts', ...))`. */
  workerFactory?: () => PoolWorker;
}

const DEFAULT_WORKER_FACTORY = (): PoolWorker => {
  // `new URL` so Vite's `?worker`-equivalent module-worker bundling picks it up.
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as PoolWorker;
};

/** Partition `n` candidates into `pool` near-equal sub-batches. */
function splitCandidateCount(n: number, pool: number): number[] {
  if (pool <= 1 || n <= 1) return [n];
  const k = Math.min(pool, n);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export function runOptimizer(
  input: OptimizationInput,
  opts: RunOptimizerOptions = {},
): RunHandle {
  const factory = opts.workerFactory ?? DEFAULT_WORKER_FACTORY;
  const requested = Math.max(1, Math.floor(input.concurrency ?? 1));
  const subCounts = splitCandidateCount(input.candidateCount, requested);
  const poolSize = subCounts.length;

  const workers: PoolWorker[] = [];
  const ids: string[] = [];
  let cancelled = false;

  const promise = new Promise<OptimizationResult>((resolve, reject) => {
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const subResults: OptimizationCandidate[][] = new Array(poolSize);
    let completed = 0;
    let failed = false;

    const finishOne = (idx: number, candidates: OptimizationCandidate[]) => {
      subResults[idx] = candidates;
      completed++;
      // Free this worker as soon as it's done.
      try { workers[idx].terminate(); } catch { /* noop */ }
      if (completed === poolSize && !failed) {
        const merged = subResults.flat();
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        resolve({ candidates: merged, totalMs: now - start });
      }
    };

    const failAll = (err: Error) => {
      if (failed) return;
      failed = true;
      for (const w of workers) { try { w.terminate(); } catch { /* noop */ } }
      reject(err);
    };

    for (let i = 0; i < poolSize; i++) {
      const w = factory();
      const id = `run-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      workers.push(w);
      ids.push(id);
      const localIdx = i;
      const localId = id;
      // candidateCount offset for this sub-batch — used to renumber progress events.
      const offset = subCounts.slice(0, i).reduce((a, b) => a + b, 0);

      w.addEventListener('message', (e) => {
        const msg = e.data as
          | { type: 'progress'; id: string; candidate: number; phase: string }
          | { type: 'done'; id: string; result: OptimizationResult }
          | { type: 'error'; id: string; message: string };
        if (!msg || (msg as { id: string }).id !== localId) return;
        if (msg.type === 'progress') {
          opts.onProgress?.(msg.phase, msg.candidate + offset);
        } else if (msg.type === 'done') {
          finishOne(localIdx, msg.result.candidates);
        } else if (msg.type === 'error') {
          failAll(new Error(msg.message));
        }
      });

      const subInput: OptimizationInput = {
        ...input,
        candidateCount: subCounts[i],
        // Don't recurse: each worker runs in single-worker mode.
        concurrency: 1,
      };
      w.postMessage({ type: 'run', input: subInput, id: localId });
    }
  });

  return {
    promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (let i = 0; i < workers.length; i++) {
        try { workers[i].postMessage({ type: 'cancel', id: ids[i] }); } catch { /* noop */ }
        try { workers[i].terminate(); } catch { /* noop */ }
      }
    },
    onProgress: opts.onProgress,
  };
}
