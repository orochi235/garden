import type { View } from '@orochi235/weasel';
import { rectPath } from '@orochi235/weasel';
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { FILL_COLORS } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import type { PlantingNode, SceneNode, ScenePose, StructureNode, ZoneNode } from '../adapters/gardenScene';
import { type PatternId, paintFor } from '../patterns';
import { plantDrawCommands } from '../plantRenderers';
import { circlePolygon, type DrawCommand, ellipsePolygon } from '../util/weaselLocal';
import type { GetUi } from './worldLayerData';

/**
 * Per-node, world-space scene-slot painter for the garden's three node kinds.
 *
 * This is a faithful, per-entity extraction of the *body* drawing in
 * `zoneLayersWorld.ts` / `structureLayersWorld.ts` / `plantingLayersWorld.ts`.
 * Those layers are `space: 'screen'` and each wraps their flattened children in
 * `viewToMat3(view)`; the kit scene slot is WORLD-SPACE (the kit wraps the
 * returned commands in the view transform itself), so here we strip that outer
 * group/transform and return the per-entity body commands directly.
 *
 * Excluded (handled elsewhere — labels, de-occlusion, conflict/occupancy
 * overlays, selection rings, container overlays, plantable-area, spacing,
 * measurements, container walls, group/clash highlights):
 *   - all `*-labels` layers
 *   - `planting-conflicts`, `container-overlays`, `planting-spacing`,
 *     `planting-measurements`, `container-walls`, structure clash highlights
 *
 * `pose` carries the live (possibly preview/ghost) world position; we read it
 * where the source layers read the entity's `x`/`y`, so ghosts at preview poses
 * render correctly. Every other field (width/length/color/pattern/fill/cultivar)
 * is read from `node.data` exactly as the layers read the entity.
 */

/** Pixel-constant stroke helper — identical to the `px` in the source layers. */
function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale.x);
}

// ---------------------------------------------------------------------------
// Zone body — mirrors `zone-bodies` + `zone-patterns` + `zone-highlights`
// (labels excluded). Source reads z.x/z.y; we substitute pose.x/pose.y.
// ---------------------------------------------------------------------------
function drawZone(node: ZoneNode, pose: ScenePose, view: View, getUi: GetUi): DrawCommand[] {
  const z: Zone = node.data;
  const x = pose.x;
  const y = pose.y;
  const dashSize = 6 / Math.max(0.0001, view.scale.x);
  const gapSize = 3 / Math.max(0.0001, view.scale.x);

  const out: DrawCommand[] = [
    // zone-bodies: body fill
    {
      kind: 'path',
      path: rectPath(x, y, z.width, z.length),
      fill: { fill: 'solid', color: z.color },
    },
    // zone-bodies: dashed outline
    {
      kind: 'path',
      path: rectPath(x, y, z.width, z.length),
      stroke: {
        paint: { fill: 'solid', color: '#4A7C59' },
        width: px(view, 1.5),
        dash: [dashSize, gapSize],
      },
    },
  ];

  // zone-patterns
  if (z.pattern != null) {
    out.push({
      kind: 'path',
      path: rectPath(x, y, z.width, z.length),
      fill: paintFor(z.pattern as PatternId),
    });
  }

  // zone-highlights
  const { getHighlight } = getUi();
  const op = getHighlight(z.id);
  if (op > 0) {
    out.push({
      kind: 'group',
      alpha: op,
      children: [
        {
          kind: 'path',
          path: rectPath(x, y, z.width, z.length),
          stroke: {
            paint: { fill: 'solid', color: '#FFD700' },
            width: px(view, 2),
          },
        },
      ],
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Structure body — mirrors the SINGLE-structure branches of `structure-walls`,
// `structure-bodies`, `structure-surfaces` + `structure-highlights` (single).
// Group rendering (compound fills / group highlights) is cross-node state and
// is NOT reproduced here — see the note returned to the caller. Source reads
// s.x/s.y; we substitute pose.x/pose.y.
// ---------------------------------------------------------------------------
function drawStructure(
  node: StructureNode,
  pose: ScenePose,
  view: View,
  getUi: GetUi,
): DrawCommand[] {
  const s: Structure = node.data;
  const x = pose.x;
  const y = pose.y;
  const w = s.width;
  const h = s.length;
  const lw = px(view, 1);
  const out: DrawCommand[] = [];

  // ---- structure-walls (outer ring/frame for containers) ----
  if (s.type === 'pot' || s.type === 'felt-planter') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    out.push({
      kind: 'path',
      path: circlePolygon(cx, cy, r),
      fill: { fill: 'solid', color: s.color },
      stroke: {
        paint: { fill: 'solid', color: s.type === 'pot' ? '#8a3a18' : '#333333' },
        width: lw,
      },
    });
    if (s.type === 'felt-planter') {
      const d = r * 2;
      if (d > 4) {
        out.push({
          kind: 'path',
          path: circlePolygon(cx, cy, r),
          fill: paintFor('chunks', {
            bg: s.color,
            color: '#1a1a1a',
            density: 0.35,
            chunkSize: 1,
            size: 24,
            seed: 7,
          }),
        });
      }
    }
  } else if (s.type === 'raised-bed') {
    out.push({
      kind: 'path',
      path: rectPath(x, y, w, h),
      fill: { fill: 'solid', color: s.color },
      stroke: { paint: { fill: 'solid', color: '#333333' }, width: lw },
    });
  }

  // ---- structure-bodies (soil disc/rect + pattern; or plain body) ----
  if (s.type === 'pot' || s.type === 'felt-planter') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    const rimWidth = Math.min(r, Math.max(px(view, 1.5), s.wallThicknessFt));
    const innerR = r - rimWidth;
    const soilColor = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    out.push({
      kind: 'path',
      path: circlePolygon(cx, cy, innerR),
      fill: { fill: 'solid', color: soilColor },
    });
    if (s.fill === 'potting-mix') {
      const innerD = innerR * 2;
      if (innerD > 4) {
        out.push({
          kind: 'path',
          path: circlePolygon(cx, cy, innerR),
          fill: paintFor('chunks', { bg: soilColor }),
        });
      }
    }
  } else if (s.type === 'raised-bed') {
    const wallWidth = Math.min(Math.min(w, h) / 2, Math.max(px(view, 2), s.wallThicknessFt));
    const soilColor = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    out.push({
      kind: 'path',
      path: rectPath(x + wallWidth, y + wallWidth, w - wallWidth * 2, h - wallWidth * 2),
      fill: { fill: 'solid', color: soilColor },
    });
    if (s.fill === 'potting-mix') {
      const iw = w - wallWidth * 2;
      const ih = h - wallWidth * 2;
      if (iw > 4 && ih > 4) {
        out.push({
          kind: 'path',
          path: rectPath(x + wallWidth, y + wallWidth, iw, ih),
          fill: paintFor('chunks', { bg: soilColor }),
        });
      }
    }
  } else if (s.shape === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    out.push({
      kind: 'path',
      path: ellipsePolygon(cx, cy, w / 2, h / 2),
      fill: { fill: 'solid', color: s.color },
      ...(s.surface
        ? {}
        : { stroke: { paint: { fill: 'solid' as const, color: '#333333' }, width: lw } }),
    });
  } else {
    out.push({
      kind: 'path',
      path: rectPath(x, y, w, h),
      fill: { fill: 'solid', color: s.color },
      ...(s.surface
        ? {}
        : { stroke: { paint: { fill: 'solid' as const, color: '#333333' }, width: lw } }),
    });
  }

  // ---- structure-surfaces (hatch overlay for surface structures) ----
  if (s.surface) {
    const path =
      s.shape === 'circle'
        ? ellipsePolygon(x + w / 2, y + h / 2, w / 2, h / 2)
        : rectPath(x, y, w, h);
    out.push({
      kind: 'path',
      path,
      fill: paintFor('hatch'),
    });
  }

  // ---- structure-highlights (single-structure ring only) ----
  const { getHighlight } = getUi();
  const op = getHighlight(s.id);
  if (op > 0) {
    const path =
      s.shape === 'circle'
        ? ellipsePolygon(x + w / 2, y + h / 2, w / 2, h / 2)
        : rectPath(x, y, w, h);
    out.push({
      kind: 'group',
      alpha: op,
      children: [
        {
          kind: 'path',
          path,
          stroke: { paint: { fill: 'solid', color: '#FFD700' }, width: px(view, 2) },
        },
      ],
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Planting body — mirrors `planting-icons` (single glyph) + `planting-highlights`
// (labels / measurements / spacing / conflicts / occupancy excluded). The
// source resolves the parent + sibling count to size the glyph; we resolve the
// same from the live store, but read the planting's world position from `pose`
// so a preview/ghost pose renders the icon at the dragged location.
// ---------------------------------------------------------------------------

interface PlantingParentLite {
  width: number;
  length: number;
  layout: import('../../model/layout').Layout | null;
}

/** Resolve a planting's parent (structure or zone) + sibling count from store. */
function resolvePlantingParent(
  p: Planting,
): { parent: PlantingParentLite | null; siblingCount: number } {
  const g = useGardenStore.getState().garden;
  const z = g.zones.find((x) => x.id === p.parentId);
  const s = z ? undefined : g.structures.find((x) => x.id === p.parentId);
  const parentEntity: Zone | Structure | undefined = z ?? s;
  const parent: PlantingParentLite | null = parentEntity
    ? { width: parentEntity.width, length: parentEntity.length, layout: parentEntity.layout }
    : null;
  let siblingCount = 0;
  for (const q of g.plantings) if (q.parentId === p.parentId) siblingCount++;
  return { parent, siblingCount };
}

/** Identical to `plantingRadius` in plantingLayersWorld.ts, generalized to a
 *  pre-resolved parent + sibling count. */
function plantingRadius(
  p: Planting,
  parent: PlantingParentLite,
  siblingCount: number,
  plantIconScale: number,
): number {
  const cultivar = getCultivar(p.cultivarId);
  const footprint = cultivar?.footprintFt ?? 0.5;
  const isSingleFill = parent.layout?.type === 'single' && siblingCount === 1;
  return isSingleFill
    ? (Math.min(parent.width, parent.length) / 2) * plantIconScale
    : (footprint / 2) * plantIconScale;
}

/** Identical to `plantGlyphAt` in plantingLayersWorld.ts. */
function plantGlyphAt(
  cultivarId: string,
  wx: number,
  wy: number,
  radius: number,
  showFootprintCircles: boolean,
): DrawCommand[] {
  const cultivar = getCultivar(cultivarId);
  const color = cultivar?.color ?? '#4A7C59';
  const iconBgColor = showFootprintCircles ? (cultivar?.iconBgColor ?? null) : 'transparent';
  return plantDrawCommands(cultivarId, wx, wy, radius, color, iconBgColor);
}

function drawPlanting(
  node: PlantingNode,
  pose: ScenePose,
  view: View,
  getUi: GetUi,
): DrawCommand[] {
  const p: Planting = node.data;
  const ui = getUi();
  const wx = pose.x;
  const wy = pose.y;
  const { parent, siblingCount } = resolvePlantingParent(p);

  const out: DrawCommand[] = [];

  // ---- planting-icons (one glyph) ----
  // When the parent can't be resolved, fall back to the cultivar footprint so a
  // detached/ghost planting still draws (matches the source's clamp behavior).
  const baseRadius = parent
    ? plantingRadius(p, parent, siblingCount, ui.plantIconScale)
    : ((getCultivar(p.cultivarId)?.footprintFt ?? 0.5) / 2) * ui.plantIconScale;
  const radius = Math.max(px(view, 3), baseRadius);
  out.push(...plantGlyphAt(p.cultivarId, wx, wy, radius, ui.showFootprintCircles));

  // ---- planting-highlights ----
  const opacity = ui.getHighlight(p.id);
  if (opacity > 0) {
    out.push({
      kind: 'group',
      alpha: opacity,
      children: [
        {
          kind: 'path',
          path: circlePolygon(wx, wy, radius + px(view, 1)),
          stroke: { paint: { fill: 'solid', color: '#FFD700' }, width: px(view, 2) },
        },
      ],
    });
  }

  return out;
}

/**
 * Build the garden scene-slot painter. Dispatches on `node.kind` and returns
 * WORLD-SPACE `DrawCommand[]` for that single entity's body (no `viewToMat3`
 * wrap — the kit applies the view transform around these commands itself).
 */
export function createGardenDrawOne(
  getUi: GetUi,
): (node: SceneNode, pose: ScenePose, view: View) => DrawCommand[] {
  return (node, pose, view) => {
    switch (node.kind) {
      case 'zone':
        return drawZone(node, pose, view, getUi);
      case 'structure':
        return drawStructure(node, pose, view, getUi);
      case 'planting':
        return drawPlanting(node, pose, view, getUi);
    }
  };
}
