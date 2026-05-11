import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import { type DrawCommand, circlePolygon } from '../util/weaselLocal';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
} from '../layouts/trayDropTargets';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { trayInteriorOffsetIn, type Tray } from '../../model/nursery';
import { getCultivar } from '../../model/cultivars';
import {
  cultivarHasTrayWarning,
  SEEDLING_WARNING_COLOR,
} from '../../model/seedlingWarnings';
import { plantDrawCommands } from '../plantRenderers';

/**
 * Palette → nursery tray drag (sow cell / fill row / fill column / fill tray).
 *
 * Owns its own preview rendering via `renderPreview` — the framework's
 * `dragPreviewLayer` calls into it inside a `viewToMat3(view)` group, so the
 * commands returned here are in world coords.
 */
export type SeedFillInput = {
  cultivarId: string;
  world: { x: number; y: number } | null;
  shift: boolean;
};

export type SeedFillPutative =
  | { trayId: string; cultivarId: string; scope: 'all'; replace?: boolean }
  | { trayId: string; cultivarId: string; scope: 'row'; index: number; replace?: boolean }
  | { trayId: string; cultivarId: string; scope: 'col'; index: number; replace?: boolean }
  | { trayId: string; cultivarId: string; scope: 'cell'; row: number; col: number; replace?: boolean };

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
      const slot = tray.slots[m.row * tray.cols + m.col];
      if (slot.state === 'sown' && !replace) return null;
      return { ...base, scope: 'cell', row: m.row, col: m.col };
    },

    renderPreview(
      putative: SeedFillPutative,
      view: { x: number; y: number; scale: number },
    ): DrawCommand[] {
      const ss = useGardenStore.getState().garden.nursery;
      const tray = ss.trays.find((t) => t.id === putative.trayId);
      if (!tray) return [];
      const cultivar = getCultivar(putative.cultivarId);
      if (!cultivar) return [];
      const showWarnings = useUiStore.getState().showSeedlingWarnings;
      const cells = fillPreviewCellCommands(tray, putative, showWarnings, view);
      if (cells.length === 0) return [];
      const o = trayWorldOrigin(tray, ss);
      return [
        {
          kind: 'group',
          transform: translateMat3(o.x, o.y),
          children: [{ kind: 'group', alpha: 0.4, children: cells }],
        },
      ];
    },

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
  const ss = useGardenStore.getState().garden.nursery;
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
  const ss = useGardenStore.getState().garden.nursery;
  const o = trayWorldOrigin(tray, ss);
  return { x: world.x - o.x, y: world.y - o.y };
}

function fillPreviewCellCommands(
  tray: Tray,
  preview: SeedFillPutative,
  showWarnings: boolean,
  view: { x: number; y: number; scale: number },
): DrawCommand[] {
  const p = tray.cellPitchIn;
  const off = trayInteriorOffsetIn(tray);
  const radius = (p * 0.85) / 2;
  const previewWarn = showWarnings && cultivarHasTrayWarning(preview.cultivarId, tray);

  const cmds: DrawCommand[] = [];
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      if (preview.scope === 'row' && r !== preview.index) continue;
      if (preview.scope === 'col' && c !== preview.index) continue;
      if (preview.scope === 'cell' && (r !== preview.row || c !== preview.col)) continue;
      const slot = tray.slots[r * tray.cols + c];
      if (slot.state === 'sown' && !preview.replace) continue;
      const cx = off.x + c * p + p / 2;
      const cy = off.y + r * p + p / 2;
      const cultivar = getCultivar(preview.cultivarId);
      const color = cultivar?.color ?? '#4A7C59';
      const iconBgColor = cultivar?.iconBgColor ?? null;
      const glyph = plantDrawCommands(preview.cultivarId, 0, 0, radius, color, iconBgColor);
      cmds.push({
        kind: 'group',
        transform: translateMat3(cx, cy),
        children: glyph,
      });
      if (previewWarn) {
        const strokePx = 1.5 / Math.max(0.0001, view.scale);
        const padPx = 2 / Math.max(0.0001, view.scale);
        cmds.push({
          kind: 'path',
          path: circlePolygon(cx, cy, radius + padPx),
          stroke: { paint: { fill: 'solid', color: SEEDLING_WARNING_COLOR }, width: strokePx },
        });
      }
    }
  }
  return cmds;
}

/** Column-major 3×3 translation matrix. */
function translateMat3(tx: number, ty: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]);
}
