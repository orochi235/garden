import { useCallback, useRef } from 'react';

/** Payload carried by an in-flight pointer drag — `kind` routes to drop zones, `ids` lists the dragged items. */
export interface DragPayload {
  kind: string;
  ids: string[];
  data?: unknown;
}

interface DropZone {
  el: HTMLElement;
  accepts: (kind: string) => boolean;
  onDrop: (payload: DragPayload, clientX: number, clientY: number) => void;
  onOver?: (active: boolean) => void;
  onMove?: (payload: DragPayload, clientX: number, clientY: number) => void;
}

const dropZones = new Set<DropZone>();
let activeDrag: { payload: DragPayload; ghost: HTMLElement; lastZone: DropZone | null } | null = null;

function registerDropZone(zone: DropZone): () => void {
  dropZones.add(zone);
  return () => {
    if (activeDrag?.lastZone === zone) activeDrag.lastZone = null;
    dropZones.delete(zone);
  };
}

function findZone(x: number, y: number, kind: string): DropZone | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  for (const z of dropZones) {
    if (z.el.contains(el) && z.accepts(kind)) return z;
  }
  return null;
}

function defaultGhost(source: HTMLElement, payload: DragPayload): HTMLElement {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.opacity = '0.85';
  clone.style.zIndex = '10000';
  clone.style.transition = 'none';
  clone.style.transformOrigin = 'center center';
  if (payload.ids.length > 1) {
    const badge = document.createElement('div');
    badge.textContent = String(payload.ids.length);
    badge.style.position = 'absolute';
    badge.style.top = '-6px';
    badge.style.right = '-6px';
    badge.style.background = '#FFC857';
    badge.style.color = '#000';
    badge.style.borderRadius = '999px';
    badge.style.padding = '2px 8px';
    badge.style.fontWeight = 'bold';
    badge.style.fontSize = '12px';
    badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
    clone.appendChild(badge);
  }
  return clone;
}

function positionGhost(el: HTMLElement, x: number, y: number) {
  el.style.transform = `translate(${x - el.offsetWidth / 2}px, ${y - el.offsetHeight / 2}px) scale(0.92)`;
}

function beginPointerDrag(
  payload: DragPayload,
  source: HTMLElement,
  startX: number,
  startY: number,
  ghostFn: (source: HTMLElement, payload: DragPayload) => HTMLElement,
) {
  if (activeDrag) return;
  const ghost = ghostFn(source, payload);
  document.body.appendChild(ghost);
  positionGhost(ghost, startX, startY);
  activeDrag = { payload, ghost, lastZone: null };

  function onMove(e: PointerEvent) {
    if (!activeDrag) return;
    positionGhost(activeDrag.ghost, e.clientX, e.clientY);
    const zone = findZone(e.clientX, e.clientY, payload.kind);
    if (zone !== activeDrag.lastZone) {
      activeDrag.lastZone?.onOver?.(false);
      zone?.onOver?.(true);
      activeDrag.lastZone = zone;
    }
    zone?.onMove?.(payload, e.clientX, e.clientY);
  }
  function onUp(e: PointerEvent) {
    if (!activeDrag) return;
    const zone = findZone(e.clientX, e.clientY, payload.kind);
    activeDrag.lastZone?.onOver?.(false);
    if (zone) zone.onDrop(activeDrag.payload, e.clientX, e.clientY);
    cleanup();
  }
  function onCancel() {
    activeDrag?.lastZone?.onOver?.(false);
    cleanup();
  }
  function cleanup() {
    activeDrag?.ghost.remove();
    activeDrag = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}

const DRAG_THRESHOLD_PX_SQ = 25;

/** Options for `useDragHandle`; supply `createGhost` to override the default DOM-clone ghost. */
export interface DragHandleOptions {
  createGhost?: (source: HTMLElement, payload: DragPayload) => HTMLElement;
}

/** Attach a pointer-driven drag handle: `getPayload` is read at threshold-cross time and a ghost follows the pointer. */
export function useDragHandle(
  getPayload: () => DragPayload | null,
  options?: DragHandleOptions,
) {
  const optsRef = useRef(options);
  optsRef.current = options;
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    if (e.target instanceof HTMLElement && e.target.closest('input, button, select, textarea')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    function onMove(ev: PointerEvent) {
      if (started) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX_SQ) {
        started = true;
        const payload = getPayload();
        cleanup();
        if (payload) {
          target.addEventListener(
            'click',
            (ce) => { ce.stopPropagation(); ce.preventDefault(); },
            { capture: true, once: true },
          );
          beginPointerDrag(payload, target, ev.clientX, ev.clientY, optsRef.current?.createGhost ?? defaultGhost);
        }
      }
    }
    function onEnd() { cleanup(); }
    function cleanup() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  }, [getPayload]);

  return { onPointerDown, style: { touchAction: 'none' as const } };
}

/** Options for `useDropZone`; `accepts` filters by `payload.kind`. */
export interface DropZoneOptions {
  accepts: (kind: string) => boolean;
  onDrop: (payload: DragPayload, clientX: number, clientY: number) => void;
  onOver?: (active: boolean) => void;
  onMove?: (payload: DragPayload, clientX: number, clientY: number) => void;
}

/** Register an element as a drop zone for `useDragHandle` payloads. Returns a ref-callback. */
export function useDropZone<T extends HTMLElement>(opts: DropZoneOptions): (el: T | null) => void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;
    cleanupRef.current = registerDropZone({
      el,
      accepts: (k) => optsRef.current.accepts(k),
      onDrop: (p, x, y) => optsRef.current.onDrop(p, x, y),
      onOver: (a) => optsRef.current.onOver?.(a),
      onMove: (p, x, y) => optsRef.current.onMove?.(p, x, y),
    });
  }, []);
}
