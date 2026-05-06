/**
 * Unit tests for the worker-pool plumbing in runOptimizer.ts. Uses an inline
 * fake Worker so the test environment does not need real Web Worker support.
 */
import { describe, it, expect, vi } from 'vitest';
import { runOptimizer, type PoolWorker } from './runOptimizer';
import type { OptimizationInput, OptimizationResult } from './types';
import { DEFAULT_WEIGHTS } from './types';

interface RunMsg { type: 'run'; input: OptimizationInput; id: string }
interface CancelMsg { type: 'cancel'; id: string }

class FakeWorker implements PoolWorker {
  static instances: FakeWorker[] = [];
  listeners: Array<(e: { data: unknown }) => void> = [];
  posted: Array<RunMsg | CancelMsg> = [];
  terminated = false;
  /** Pending resolver — call to deliver a 'done' message. */
  resolveDone?: (candidates: number) => void;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(msg: unknown): void {
    this.posted.push(msg as RunMsg | CancelMsg);
    const m = msg as RunMsg | CancelMsg;
    if (m.type === 'run') {
      // Defer a 'done' until the test triggers it via resolveDone.
      this.resolveDone = (candidates: number) => {
        const placements = Array.from({ length: candidates }, () => ({
          placements: [], score: 0, reason: 'fake', gap: 0, solveMs: 1,
        }));
        const result: OptimizationResult = { candidates: placements, totalMs: 1 };
        for (const l of this.listeners) {
          l({ data: { type: 'done', id: m.id, result } });
        }
      };
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(_type: 'message', listener: (e: { data: unknown }) => void): void {
    this.listeners.push(listener);
  }
}

const baseInput: OptimizationInput = {
  bed: { widthIn: 16, lengthIn: 16, edgeClearanceIn: 0 },
  plants: [{ cultivarId: 'a', count: 2, footprintIn: 4, heightIn: null }],
  weights: DEFAULT_WEIGHTS,
  gridResolutionIn: 4,
  timeLimitSec: 5,
  mipGap: 0.01,
  candidateCount: 3,
  diversityThreshold: 1,
};

describe('runOptimizer worker pool', () => {
  it('default concurrency=1 spawns a single worker', async () => {
    FakeWorker.instances = [];
    const handle = runOptimizer(
      { ...baseInput, candidateCount: 3 },
      { workerFactory: () => new FakeWorker() },
    );
    expect(FakeWorker.instances.length).toBe(1);
    // First worker got candidateCount=3 and concurrency=1.
    const run = FakeWorker.instances[0].posted[0] as RunMsg;
    expect(run.type).toBe('run');
    expect(run.input.candidateCount).toBe(3);
    expect(run.input.concurrency).toBe(1);
    FakeWorker.instances[0].resolveDone?.(3);
    const result = await handle.promise;
    expect(result.candidates).toHaveLength(3);
  });

  it('concurrency>1 dispatches sub-batches to multiple workers concurrently', async () => {
    FakeWorker.instances = [];
    const handle = runOptimizer(
      { ...baseInput, candidateCount: 4, concurrency: 3 },
      { workerFactory: () => new FakeWorker() },
    );
    // 4 candidates split across 3 workers → [2, 1, 1].
    expect(FakeWorker.instances.length).toBe(3);
    const counts = FakeWorker.instances.map(
      (w) => (w.posted[0] as RunMsg).input.candidateCount,
    );
    expect(counts).toEqual([2, 1, 1]);
    // All three workers received their 'run' message before any 'done'
    // resolves — i.e., they were dispatched concurrently, not sequentially.
    expect(FakeWorker.instances.every((w) => w.posted.length === 1)).toBe(true);
    expect(FakeWorker.instances.every((w) => !w.terminated)).toBe(true);

    // Resolve in reverse order; merged result must contain all candidates.
    FakeWorker.instances[2].resolveDone?.(1);
    FakeWorker.instances[1].resolveDone?.(1);
    FakeWorker.instances[0].resolveDone?.(2);
    const result = await handle.promise;
    expect(result.candidates).toHaveLength(4);
    // Each worker terminated as it completed.
    expect(FakeWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it('caps pool size at candidateCount when concurrency exceeds it', () => {
    FakeWorker.instances = [];
    runOptimizer(
      { ...baseInput, candidateCount: 2, concurrency: 8 },
      { workerFactory: () => new FakeWorker() },
    );
    expect(FakeWorker.instances.length).toBe(2);
  });

  it('cancel terminates all in-flight workers and posts cancel to each', () => {
    FakeWorker.instances = [];
    const handle = runOptimizer(
      { ...baseInput, candidateCount: 3, concurrency: 3 },
      { workerFactory: () => new FakeWorker() },
    );
    expect(FakeWorker.instances.length).toBe(3);
    // Swallow the rejection that may follow; we're only asserting cancel mechanics.
    handle.promise.catch(() => { /* expected */ });
    handle.cancel();
    for (const w of FakeWorker.instances) {
      expect(w.terminated).toBe(true);
      expect(w.posted.some((m) => m.type === 'cancel')).toBe(true);
    }
  });

  it('progress events from sub-batches are renumbered to a global candidate index', () => {
    FakeWorker.instances = [];
    const onProgress = vi.fn();
    runOptimizer(
      { ...baseInput, candidateCount: 4, concurrency: 2 },
      { workerFactory: () => new FakeWorker(), onProgress },
    );
    // Workers receive [2, 2] candidates. Worker 0 reports candidate 0 → global 0;
    // worker 1 reports candidate 0 → global 2 (offset by worker 0's count).
    const w0 = FakeWorker.instances[0];
    const w1 = FakeWorker.instances[1];
    const id0 = (w0.posted[0] as RunMsg).id;
    const id1 = (w1.posted[0] as RunMsg).id;
    for (const l of w0.listeners) l({ data: { type: 'progress', id: id0, candidate: 0, phase: 'build' } });
    for (const l of w1.listeners) l({ data: { type: 'progress', id: id1, candidate: 1, phase: 'solve' } });
    expect(onProgress).toHaveBeenCalledWith('build', 0);
    expect(onProgress).toHaveBeenCalledWith('solve', 3);
  });
});
