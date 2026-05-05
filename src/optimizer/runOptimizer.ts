import type { OptimizationInput, OptimizationResult } from './types';

export interface RunHandle {
  promise: Promise<OptimizationResult>;
  cancel(): void;
  onProgress?: (phase: string, candidate: number) => void;
}

export function runOptimizer(input: OptimizationInput, opts: { onProgress?: (phase: string, candidate: number) => void } = {}): RunHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const promise = new Promise<OptimizationResult>((resolve, reject) => {
    worker.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') opts.onProgress?.(msg.phase, msg.candidate);
      else if (msg.type === 'done') { resolve(msg.result); worker.terminate(); }
      else if (msg.type === 'error') { reject(new Error(msg.message)); worker.terminate(); }
    });
    worker.postMessage({ type: 'run', input, id });
  });

  return {
    promise,
    cancel() { worker.postMessage({ type: 'cancel', id }); },
    onProgress: opts.onProgress,
  };
}
