import { useEffect } from 'react';
import { create } from 'zustand';

export interface FlashEntry {
  startMs: number;
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

export interface HighlightState {
  pulse: number;
  flashes: Map<string, FlashEntry>;
  hoverIds: ReadonlySet<string>;
  setHover(ids: Iterable<string>): void;
  flash(id: string, opts?: Partial<FlashEntry>): void;
  clearFlash(id: string): void;
  computeOpacity(id: string, nowMs?: number): number;
  bumpPulse(): void;
}

const DEFAULT_FLASH: Omit<FlashEntry, 'startMs'> = {
  fadeInMs: 80,
  holdMs: 600,
  fadeOutMs: 320,
};

export const useHighlightStore = create<HighlightState>((set, get) => ({
  pulse: 0,
  flashes: new Map(),
  hoverIds: new Set(),
  setHover(ids) {
    set({ hoverIds: new Set(ids) });
  },
  flash(id, opts) {
    const startMs = performance.now();
    const next = new Map(get().flashes);
    next.set(id, { ...DEFAULT_FLASH, ...opts, startMs });
    set({ flashes: next });
  },
  clearFlash(id) {
    const cur = get().flashes;
    if (!cur.has(id)) return;
    const next = new Map(cur);
    next.delete(id);
    set({ flashes: next });
  },
  computeOpacity(id, nowMs = performance.now()) {
    const s = get();
    if (s.hoverIds.has(id)) return 1;
    const f = s.flashes.get(id);
    if (!f) return 0;
    const elapsed = nowMs - f.startMs;
    if (elapsed < 0) return 0;
    if (elapsed < f.fadeInMs) return elapsed / f.fadeInMs;
    if (elapsed < f.fadeInMs + f.holdMs) return 1;
    const fadeElapsed = elapsed - f.fadeInMs - f.holdMs;
    if (fadeElapsed >= f.fadeOutMs) return 0;
    return 1 - fadeElapsed / f.fadeOutMs;
  },
  bumpPulse() {
    set((s) => ({ pulse: s.pulse + 1 }));
  },
}));

function pruneExpired(): boolean {
  const s = useHighlightStore.getState();
  if (s.flashes.size === 0) return false;
  const now = performance.now();
  let mutated = false;
  const next = new Map(s.flashes);
  for (const [id, f] of s.flashes) {
    const elapsed = now - f.startMs;
    if (elapsed >= f.fadeInMs + f.holdMs + f.fadeOutMs) {
      next.delete(id);
      mutated = true;
    }
  }
  if (mutated) useHighlightStore.setState({ flashes: next });
  return next.size > 0;
}

let rafId: number | null = null;
let refCount = 0;

function startTickIfNeeded() {
  if (rafId !== null) return;
  const tick = () => {
    rafId = null;
    const stillActive = pruneExpired();
    useHighlightStore.getState().bumpPulse();
    if (stillActive || useHighlightStore.getState().hoverIds.size > 0) {
      rafId = requestAnimationFrame(tick);
    }
  };
  rafId = requestAnimationFrame(tick);
}

/** Subscribe a consumer to the rAF tick. While at least one consumer is mounted
 *  and there are active flashes (or hovers requesting animation), the store
 *  bumps `pulse` once per frame. The loop suspends when both sources go quiet. */
export function useHighlightTick(): number {
  useEffect(() => {
    refCount += 1;
    startTickIfNeeded();
    return () => {
      refCount -= 1;
      if (refCount <= 0 && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, []);
  // Subscribe to pulse so React re-renders the consumer when the tick fires.
  return useHighlightStore((s) => s.pulse);
}

/** Test hook — clear all flash state. */
export function resetHighlightStore() {
  useHighlightStore.setState({ pulse: 0, flashes: new Map(), hoverIds: new Set() });
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  refCount = 0;
}

/** Imperative kick: any time something flashes, the rAF loop must wake. */
useHighlightStore.subscribe((state, prev) => {
  if (state.flashes !== prev.flashes && state.flashes.size > 0) startTickIfNeeded();
  if (state.hoverIds !== prev.hoverIds && state.hoverIds.size > 0) startTickIfNeeded();
});
