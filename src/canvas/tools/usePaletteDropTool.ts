import { useEffect, type RefObject } from 'react';
import { createDragGhost } from '@orochi235/weasel';
import { onIconLoad, renderPlant } from '../plantRenderers';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
} from '../layouts/trayDropTargets';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { trayWorldOrigin } from '../adapters/seedStartingScene';
import type { View } from '../layers/worldLayerData';
import type { Tray } from '../../model/seedStarting';

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<View>;
}

/**
 * Palette → seed-starting canvas drop tool.
 *
 * The kit's `Tool` primitive (a `defineTool` record) only sees pointer events
 * the canvas dispatcher gets — and palette drags begin on the palette item, so
 * the dispatcher never sees their pointerdown. Rather than synthesizing a
 * pointerdown, this hook implements the same "armed, then drive a gesture"
 * shape outside the dispatcher: it subscribes to `palettePointerPayload` in
 * `useUiStore`. When the palette sets a payload, this hook attaches its own
 * document-level pointer listeners, runs a threshold drag, and reads the
 * canvas's *local* view (via `viewRef`) to compute world coords — so the
 * canvas's view is never mirrored into the ui store.
 *
 * Behavior matches the legacy `App.handleSeedDragBegin` flow: ghost icon
 * follows the cursor; while over a fill target the ghost hides and a fill
 * preview is shown; release commits the matching sow/fill action; cancel
 * (escape, lost capture) clears overlays without committing.
 */
export function usePaletteDropTool({ containerRef, viewRef }: Options): void {
  useEffect(() => {
    let stopGesture: (() => void) | null = null;

    const unsub = useUiStore.subscribe((state, prev) => {
      const next = state.palettePointerPayload;
      const before = prev.palettePointerPayload;
      if (next === before) return;
      // A new payload arrived — start a gesture (cancel any in-flight one).
      if (stopGesture) {
        stopGesture();
        stopGesture = null;
      }
      if (next && next.entry.category === 'plantings') {
        stopGesture = startGesture(next.entry, next.pointerEvent);
      }
    });

    function clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const view = viewRef.current;
      if (!view || !view.scale) return null;
      return {
        x: (clientX - rect.left) / view.scale + view.x,
        y: (clientY - rect.top) / view.scale + view.y,
      };
    }

    function getCurrentTray(): Tray | null {
      const ui = useUiStore.getState();
      const garden = useGardenStore.getState().garden;
      return garden.seedStarting.trays.find((t) => t.id === ui.currentTrayId) ?? null;
    }

    /**
     * Multi-tray hit-test: prefer the tray under the cursor; fall back to the
     * current tray for off-tray drops (so a sloppy drop near the active tray
     * still fills it).
     */
    function pickTrayAtWorld(world: { x: number; y: number }): Tray | null {
      const ss = useGardenStore.getState().garden.seedStarting;
      for (const t of ss.trays) {
        const o = trayWorldOrigin(t, ss);
        if (world.x >= o.x && world.y >= o.y && world.x < o.x + t.widthIn && world.y < o.y + t.heightIn) {
          return t;
        }
      }
      return getCurrentTray();
    }

    function worldToTrayLocal(world: { x: number; y: number }, tray: Tray): { x: number; y: number } {
      const ss = useGardenStore.getState().garden.seedStarting;
      const o = trayWorldOrigin(tray, ss);
      return { x: world.x - o.x, y: world.y - o.y };
    }

    function startGesture(
      entry: { id: string; color?: string; category: string },
      pe: PointerEvent,
    ): () => void {
      const startX = pe.clientX;
      const startY = pe.clientY;
      const threshold = 4;
      let activated = false;
      let shiftHeld = pe.shiftKey;
      let lastClientX = startX;
      let lastClientY = startY;

      let ghost: ReturnType<typeof createDragGhost> | null = null;
      let unsubIcon: (() => void) | null = null;

      // Mirror legacy: arm `seedDragCultivarId` so the in-canvas sow/fill tools
      // (useSowCellTool / useFillTrayTool) treat clicks as sow actions if the
      // user happens to land on the canvas with no movement (sub-threshold).
      useUiStore.getState().setSeedDragCultivarId(entry.id);

      function ensureGhost() {
        if (ghost) return ghost;
        const tray = getCurrentTray();
        const ppi = viewRef.current?.scale ?? 30;
        const cellPx = tray ? tray.cellPitchIn * ppi : 30;
        const radius = (cellPx * 0.85) / 2;
        ghost = createDragGhost({
          sizeCss: radius * 2,
          paint: (ctx) => renderPlant(ctx, entry.id, radius, entry.color ?? '#888'),
        });
        unsubIcon = onIconLoad(() => ghost?.repaint());
        return ghost;
      }

      function moveGhost(x: number, y: number) {
        ensureGhost().move(x, y);
      }

      function setGhostHidden(hidden: boolean) {
        ghost?.setHidden(hidden);
      }

      function clearGhost() {
        unsubIcon?.();
        unsubIcon = null;
        ghost?.destroy();
        ghost = null;
      }

      function updateFillPreview() {
        const set = useUiStore.getState().setSeedFillPreview;
        const apply = (preview: Parameters<typeof set>[0]) => {
          set(preview);
          setGhostHidden(preview != null);
        };
        const w = clientToWorld(lastClientX, lastClientY);
        if (!w) {
          apply(null);
          return;
        }
        const tray = pickTrayAtWorld(w);
        if (!tray) {
          apply(null);
          return;
        }
        const local = worldToTrayLocal(w, tray);
        const replace = shiftHeld;
        const hit = hitTrayDropTarget(getTrayDropTargets(tray), local);
        if (!hit) {
          apply(null);
          return;
        }
        const m = hit.meta;
        const base = { trayId: tray.id, cultivarId: entry.id, replace };
        if (m.kind === 'all') {
          apply({ ...base, scope: 'all' });
        } else if (m.kind === 'row') {
          apply({ ...base, scope: 'row', index: m.row });
        } else if (m.kind === 'col') {
          apply({ ...base, scope: 'col', index: m.col });
        } else {
          const slot = tray.slots[m.row * tray.cols + m.col];
          if (slot.state === 'sown' && !replace) {
            apply(null);
            return;
          }
          apply({ ...base, scope: 'cell', row: m.row, col: m.col });
        }
      }

      function maybeActivate(ev: PointerEvent) {
        if (activated) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        activated = true;
        moveGhost(ev.clientX, ev.clientY);
        updateFillPreview();
      }

      function onMove(ev: PointerEvent) {
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;
        shiftHeld = ev.shiftKey;
        maybeActivate(ev);
        if (!activated) return;
        moveGhost(ev.clientX, ev.clientY);
        updateFillPreview();
      }

      function onKey(ev: KeyboardEvent) {
        if (ev.key !== 'Shift') return;
        shiftHeld = ev.type === 'keydown';
        if (activated) updateFillPreview();
      }

      function commit(ev: PointerEvent) {
        const w = clientToWorld(ev.clientX, ev.clientY);
        if (!w) return;
        const tray = pickTrayAtWorld(w);
        if (!tray) return;
        const local = worldToTrayLocal(w, tray);
        const hit = hitTrayDropTarget(getTrayDropTargets(tray), local);
        if (!hit) return;
        const m = hit.meta;
        const replace = ev.shiftKey;
        const gs = useGardenStore.getState();
        if (m.kind === 'all') {
          gs.fillTray(tray.id, entry.id, { replace });
          return;
        }
        if (m.kind === 'row') {
          gs.fillRow(tray.id, m.row, entry.id, { replace });
          return;
        }
        if (m.kind === 'col') {
          gs.fillColumn(tray.id, m.col, entry.id, { replace });
          return;
        }
        gs.sowCell(tray.id, m.row, m.col, entry.id, { replace });
      }

      function teardown() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        clearGhost();
        useUiStore.getState().setSeedFillPreview(null);
        useUiStore.getState().setSeedDragCultivarId(null);
        useUiStore.getState().setPalettePointerPayload(null);
      }

      function onUp(ev: PointerEvent) {
        if (activated) commit(ev);
        teardown();
      }

      function onCancel() {
        teardown();
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKey);

      return teardown;
    }

    return () => {
      unsub();
      if (stopGesture) stopGesture();
    };
    // viewRef and containerRef are stable refs; subscription should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
