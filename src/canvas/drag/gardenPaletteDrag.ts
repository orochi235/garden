import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { getPlantingPosition } from '../../utils/planting';
import { plantDrawCommands } from '../plantRenderers';
import type { PaletteEntry } from '../../components/palette/paletteData';
import type { Drag, DragPointerSample, DragViewport } from './putativeDrag';
import type { DrawCommand } from '../util/weaselLocal';

/**
 * Phase-2 migrated drag: palette → garden canvas (plantings only).
 *
 * The structures/zones branch of `useGardenPaletteDropTool` still runs through
 * the bespoke pointer pipeline because there's no in-canvas preview today
 * (only the floating HTML ghost icon); migrating those is its own follow-up
 * (the "plot (rectangle drag)" item in the Phase 2+ TODO).
 *
 * `TInput` is the cultivar id, palette color, and the world-coord cursor +
 * shift state. `TPutative` is the resolved planting ghost pose: parent
 * container/zone id, world position (after `getPlantingPosition` snapping),
 * and footprint radius for the ghost.
 *
 * Compute is pure: it picks a parent container or zone under the cursor and
 * returns null when no parent applies. `commit` calls `addPlanting` exactly
 * once.
 *
 * `renderPreview` draws the ghost in world coords via the framework's generic
 * `dragPreviewLayer`. This replaces the old `uiStore.dragOverlay` mirror,
 * which no render layer ever consumed (the legacy "preview" was the floating
 * HTML ghost icon — that lives in the wrapper hook because it's a DOM
 * artifact, not a canvas concern).
 */
export interface GardenPaletteInput {
  cultivarId: string;
  color?: string;
  /** World-coord cursor pose. `null` when the viewport rect isn't readable. */
  world: { x: number; y: number } | null;
  shift: boolean;
}

export interface GardenPalettePutative {
  cultivarId: string;
  color: string;
  parentId: string;
  /** World position the planting will be added at (post-`getPlantingPosition`). */
  x: number;
  y: number;
  /** Footprint radius in world feet, for ghost preview rendering. */
  footprintRadiusFt: number;
}

export const GARDEN_PALETTE_DRAG_KIND = 'garden-palette-plant';

export function createGardenPaletteDrag(opts: {
  getEntry: () => PaletteEntry | null;
}): Drag<GardenPaletteInput, GardenPalettePutative> {
  return {
    kind: GARDEN_PALETTE_DRAG_KIND,

    read(sample: DragPointerSample, viewport: DragViewport): GardenPaletteInput {
      const entry = opts.getEntry();
      if (!entry || entry.category !== 'plantings') {
        return { cultivarId: '', color: undefined, world: null, shift: sample.modifiers.shift };
      }
      const world = clientToWorld(sample, viewport);
      return {
        cultivarId: entry.id,
        color: entry.color,
        world,
        shift: sample.modifiers.shift,
      };
    },

    compute(input: GardenPaletteInput): GardenPalettePutative | null {
      if (!input.cultivarId || !input.world) return null;
      const garden = useGardenStore.getState().garden;
      const { x: worldX, y: worldY } = input.world;
      const container = garden.structures.find(
        (s) =>
          s.container &&
          worldX >= s.x && worldX <= s.x + s.width &&
          worldY >= s.y && worldY <= s.y + s.length,
      );
      const zone = garden.zones.find(
        (z) =>
          worldX >= z.x && worldX <= z.x + z.width &&
          worldY >= z.y && worldY <= z.y + z.length,
      );
      const parent = container ?? zone;
      if (!parent) return null;
      const cellSize = garden.gridCellSizeFt;
      const pos = getPlantingPosition(
        parent,
        garden.plantings.filter((p) => p.parentId === parent.id),
        worldX,
        worldY,
        cellSize,
        input.cultivarId,
      );
      const cultivar = getCultivar(input.cultivarId);
      const footprintFt = cultivar?.footprintFt ?? 0.5;
      return {
        cultivarId: input.cultivarId,
        color: input.color ?? '#888',
        parentId: parent.id,
        // Putative coords are WORLD-space — that's what `renderPreview` and
        // the conflict overlay interpret. The commit step converts back to
        // local before calling `addPlanting`.
        x: parent.x + pos.x,
        y: parent.y + pos.y,
        footprintRadiusFt: footprintFt / 2,
      };
    },

    renderPreview(putative, _view): DrawCommand[] {
      const cultivar = getCultivar(putative.cultivarId);
      const radius = putative.footprintRadiusFt;
      const color = cultivar?.color ?? putative.color;
      // Show the actual plant glyph (bg circle + icon image when loaded),
      // wrapped in alpha for the "ghost" feel.
      return [{
        kind: 'group',
        alpha: 0.7,
        children: plantDrawCommands(putative.cultivarId, putative.x, putative.y, radius, color, cultivar?.iconBgColor),
      }];
    },

    commit(putative: GardenPalettePutative): void {
      const gs = useGardenStore.getState();
      const garden = gs.garden;
      const parent =
        garden.structures.find((s) => s.id === putative.parentId) ??
        garden.zones.find((z) => z.id === putative.parentId);
      if (!parent) return;
      // putative.{x,y} are WORLD coords; addPlanting expects parent-local.
      gs.addPlanting({
        parentId: putative.parentId,
        x: putative.x - parent.x,
        y: putative.y - parent.y,
        cultivarId: putative.cultivarId,
      });
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
