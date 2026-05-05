import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
} from '../layouts/trayDropTargets';
import { trayWorldOrigin } from '../adapters/seedStartingScene';
import type { Tray } from '../../model/seedStarting';

/**
 * Phase-1-migrated drag: palette → seed-starting tray (sow cell / fill row /
 * fill column / fill tray).
 *
 * The "input" is the world coords of the cursor + modifier state + the active
 * cultivar id. The "putative" is the same shape as the legacy
 * `uiStore.seedFillPreview`, so the existing `seedling-fill-preview` render
 * layer keeps drawing it for free during the coexistence window.
 *
 * `renderPreview` is intentionally a no-op: the canonical render path is the
 * legacy fill-preview layer. The new generic preview layer dispatches here
 * but draws nothing — once the rest of the drags migrate (palette → garden,
 * move, resize, plot, area-select), each will own its own rendering.
 *
 * `onPutativeChange` mirrors the putative into `seedFillPreview` so existing
 * consumers (the layer + any tests / debug overlays) keep working unchanged.
 */
export type SeedFillInput = {
  cultivarId: string;
  world: { x: number; y: number } | null;
  shift: boolean;
};

export type SeedFillPutative = NonNullable<
  ReturnType<typeof useUiStore.getState>['seedFillPreview']
>;

export const SEED_FILL_TRAY_DRAG_KIND = 'seed-fill-tray';

export function createSeedFillTrayDrag(opts: {
  getCultivarId: () => string | null;
}): Drag<SeedFillInput, SeedFillPutative> {
  return {
    kind: SEED_FILL_TRAY_DRAG_KIND,

    read(sample: DragPointerSample, viewport: DragViewport): SeedFillInput {
      const cultivarId = opts.getCultivarId();
      if (!cultivarId) {
        return { cultivarId: '', world: null, shift: sample.modifiers.shift };
      }
      const world = clientToWorld(sample, viewport);
      return { cultivarId, world, shift: sample.modifiers.shift };
    },

    compute(input: SeedFillInput): SeedFillPutative | null {
      if (!input.cultivarId || !input.world) return null;
      const tray = pickTrayAtWorld(input.world);
      if (!tray) return null;
      const local = worldToTrayLocal(input.world, tray);
      const replace = input.shift;
      const hit = hitTrayDropTarget(getTrayDropTargets(tray), local);
      if (!hit) return null;
      const m = hit.meta;
      const base = { trayId: tray.id, cultivarId: input.cultivarId, replace };
      if (m.kind === 'all') {
        return { ...base, scope: 'all' };
      }
      if (m.kind === 'row') {
        return { ...base, scope: 'row', index: m.row };
      }
      if (m.kind === 'col') {
        return { ...base, scope: 'col', index: m.col };
      }
      // Cell hit: respect the same "skip occupied unless shift" rule the
      // legacy ad-hoc tool used.
      const slot = tray.slots[m.row * tray.cols + m.col];
      if (slot.state === 'sown' && !replace) return null;
      return { ...base, scope: 'cell', row: m.row, col: m.col };
    },

    // No-op: the legacy `seedling-fill-preview` render layer already draws
    // the putative because we mirror it into `seedFillPreview` via
    // `onPutativeChange`. When other drags migrate they will render here.
    renderPreview() {},

    commit(putative: SeedFillPutative): void {
      const gs = useGardenStore.getState();
      const replace = !!putative.replace;
      if (putative.scope === 'all') {
        gs.fillTray(putative.trayId, putative.cultivarId, { replace });
        return;
      }
      if (putative.scope === 'row') {
        gs.fillRow(putative.trayId, putative.index, putative.cultivarId, { replace });
        return;
      }
      if (putative.scope === 'col') {
        gs.fillColumn(putative.trayId, putative.index, putative.cultivarId, { replace });
        return;
      }
      gs.sowCell(putative.trayId, putative.row, putative.col, putative.cultivarId, { replace });
    },

    // Keep the legacy slot in sync so the existing render layer + tests keep
    // working during the coexistence window.
    onPutativeChange(putative): void {
      useUiStore.getState().setSeedFillPreview(putative);
    },
  };
}

function clientToWorld(
  sample: DragPointerSample,
  viewport: DragViewport,
): { x: number; y: number } | null {
  const rect = viewport.container.getBoundingClientRect();
  const view = viewport.view;
  if (!view || !view.scale) return null;
  return {
    x: (sample.clientX - rect.left) / view.scale + view.x,
    y: (sample.clientY - rect.top) / view.scale + view.y,
  };
}

function pickTrayAtWorld(world: { x: number; y: number }): Tray | null {
  const ss = useGardenStore.getState().garden.seedStarting;
  for (const t of ss.trays) {
    const o = trayWorldOrigin(t, ss);
    if (
      world.x >= o.x &&
      world.y >= o.y &&
      world.x < o.x + t.widthIn &&
      world.y < o.y + t.heightIn
    ) {
      return t;
    }
  }
  // Fallback: current tray (so a sloppy off-tray drop still fills the active tray).
  const currentTrayId = useUiStore.getState().currentTrayId;
  return ss.trays.find((t) => t.id === currentTrayId) ?? null;
}

function worldToTrayLocal(
  world: { x: number; y: number },
  tray: Tray,
): { x: number; y: number } {
  const ss = useGardenStore.getState().garden.seedStarting;
  const o = trayWorldOrigin(tray, ss);
  return { x: world.x - o.x, y: world.y - o.y };
}
