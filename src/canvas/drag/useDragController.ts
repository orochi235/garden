import { useEffect, useMemo, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import type {
  Drag,
  DragModifiers,
  DragPointerSample,
  DragViewport,
} from './putativeDrag';

/**
 * Phase 1 putative-drag controller.
 *
 * Given a registry of drags keyed by `kind`, this hook exposes an imperative
 * API to start a gesture for a given kind. While a gesture is active it
 * attaches document-level pointer + key listeners and on every change calls
 *
 *   read(sample, viewport) → compute(input) → uiStore.setDragPreview({ kind, putative })
 *
 * On pointerup it invokes `commit(putative)` and clears the slot. On
 * pointercancel or Escape it clears the slot WITHOUT committing.
 *
 * Modifier keydown / keyup re-fire `read → compute` even when the pointer
 * hasn't moved, so drags that depend on shift / alt re-render correctly.
 *
 * The controller is a thin coordinator. Drags are responsible for any DOM
 * artifacts (drag ghosts, cursor changes) themselves — those are not part of
 * the pure compute pipeline.
 */
export interface DragController {
  /**
   * Begin a gesture for the registered drag with the given kind. The seed
   * pointer event provides the starting modifiers + position; subsequent
   * document pointer events drive the rest. Returns a teardown that aborts
   * the gesture without committing (same as Escape).
   */
  start<TInput, TPutative>(
    kind: string,
    seedEvent: PointerEvent,
    viewport: () => DragViewport | null,
    options?: StartOptions<TInput, TPutative>,
  ): () => void;
  /** Whether a gesture is currently in flight. */
  isActive(): boolean;
}

export interface StartOptions<_TInput, TPutative> {
  /**
   * Optional pointer-distance threshold (in CSS pixels) before the gesture
   * "activates" — i.e. starts running compute and writing the slot. Below the
   * threshold the gesture is dormant; on pointerup before activation the
   * `onSubThresholdRelease` callback (if any) fires instead of `commit`.
   * Defaults to 0 (immediate activation).
   */
  threshold?: number;
  /** Called once when the gesture activates (crosses the threshold). */
  onActivate?: () => void;
  /**
   * Called on pointerup when the gesture never activated. Useful for
   * click-to-action behavior (e.g. arming a cultivar) layered on top of a
   * threshold drag. The framework does NOT clear `dragPreview` for sub-
   * threshold releases (it was never written).
   */
  onSubThresholdRelease?: (event: PointerEvent) => void;
  /** Called when the gesture tears down for any reason (commit, cancel, escape). */
  onTeardown?: () => void;
  /** Hook that fires on every recompute, after the slot is written. */
  onPutativeChange?: (putative: TPutative | null) => void;
}

export function useDragController(
  registry: Record<string, Drag<unknown, unknown>>,
): DragController {
  // Pin the registry in a ref so callers can pass an inline object without
  // re-running effects.
  const registryRef = useRef(registry);
  useEffect(() => { registryRef.current = registry; }, [registry]);

  const stateRef = useRef<{ stop: (() => void) | null }>({ stop: null });

  // Make sure any in-flight gesture tears down on unmount.
  useEffect(() => {
    return () => {
      stateRef.current.stop?.();
      stateRef.current.stop = null;
    };
  }, []);

  return useMemo<DragController>(() => ({
    isActive: () => stateRef.current.stop != null,
    start: <TInput, TPutative>(
      kind: string,
      seedEvent: PointerEvent,
      viewport: () => DragViewport | null,
      options?: StartOptions<TInput, TPutative>,
    ): (() => void) => {
      // Cancel any prior gesture without committing.
      stateRef.current.stop?.();
      stateRef.current.stop = null;

      const drag = registryRef.current[kind] as Drag<TInput, TPutative> | undefined;
      if (!drag) {
        // Unknown kind — quietly no-op rather than throw, so a stray
        // payload can't crash the canvas.
        return () => {};
      }

      const startX = seedEvent.clientX;
      const startY = seedEvent.clientY;
      const threshold = options?.threshold ?? 0;
      let activated = threshold === 0;
      let lastSample: DragPointerSample = sampleFrom(seedEvent);
      let lastPutative: TPutative | null = null;

      function recompute() {
        const vp = viewport();
        if (!vp) return;
        const input = drag!.read(lastSample, vp);
        const putative = drag!.compute(input);
        lastPutative = putative;
        if (putative == null) {
          useUiStore.getState().setDragPreview(null);
        } else {
          useUiStore.getState().setDragPreview({ kind: drag!.kind, putative });
        }
        drag!.onPutativeChange?.(putative);
        options?.onPutativeChange?.(putative);
      }

      function maybeActivate() {
        if (activated) return;
        const dx = lastSample.clientX - startX;
        const dy = lastSample.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        activated = true;
        options?.onActivate?.();
        recompute();
      }

      function onMove(ev: PointerEvent) {
        lastSample = sampleFrom(ev);
        if (!activated) {
          maybeActivate();
          return;
        }
        recompute();
      }

      function onKey(ev: KeyboardEvent) {
        // Update modifiers in `lastSample` and recompute. We only care about
        // the modifier-bearing keys; other key events are ignored (escape is
        // handled below).
        if (
          ev.key !== 'Shift' &&
          ev.key !== 'Alt' &&
          ev.key !== 'Control' &&
          ev.key !== 'Meta'
        ) {
          if (ev.type === 'keydown' && ev.key === 'Escape') {
            cancel();
          }
          return;
        }
        lastSample = {
          ...lastSample,
          modifiers: {
            shift: ev.shiftKey,
            alt: ev.altKey,
            ctrl: ev.ctrlKey,
            meta: ev.metaKey,
          },
        };
        if (activated) recompute();
      }

      function teardown() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        stateRef.current.stop = null;
        options?.onTeardown?.();
      }

      function commitAndTeardown() {
        if (lastPutative != null) drag!.commit(lastPutative);
        useUiStore.getState().setDragPreview(null);
        drag!.onPutativeChange?.(null);
        options?.onPutativeChange?.(null);
        teardown();
      }

      function cancel() {
        useUiStore.getState().setDragPreview(null);
        drag!.onPutativeChange?.(null);
        options?.onPutativeChange?.(null);
        teardown();
      }

      function onUp(ev: PointerEvent) {
        if (!activated) {
          options?.onSubThresholdRelease?.(ev);
          // No putative was ever written — just tear down.
          teardown();
          return;
        }
        // Fold final pointer position into the sample so commit reflects it.
        lastSample = sampleFrom(ev);
        recompute();
        commitAndTeardown();
      }

      function onCancel() {
        cancel();
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKey);

      stateRef.current.stop = cancel;

      // If the gesture starts already activated (threshold=0), do an initial
      // compute so callers see a putative right away.
      if (activated) recompute();

      return cancel;
    },
  }), []);
}

function sampleFrom(ev: PointerEvent | { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): DragPointerSample {
  const modifiers: DragModifiers = {
    shift: !!ev.shiftKey,
    alt: !!ev.altKey,
    ctrl: !!ev.ctrlKey,
    meta: !!ev.metaKey,
  };
  return { clientX: ev.clientX, clientY: ev.clientY, modifiers };
}
