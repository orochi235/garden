import {
  type RenderLayer,
  type Dims,
  type View,
  PathBuilder,
  rectPath,
  polygonFromPoints,
} from '@orochi235/weasel';
import { type DrawCommand, viewToMat3, circlePolygon } from '../util/weaselLocal';
import { computeContainerOverlay } from '../../model/containerOverlay';
import { computeOccupancy, resolveFootprint } from '../../model/cellOccupancy';
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { getPlantableBounds } from '../../model/types';
import { getSpecies } from '../../model/species';
import type { GetUi, LayerDescriptor } from './worldLayerData';
import { descriptorById } from './worldLayerData';
import { plantingWorldPose } from '../../utils/plantingPose';
import { plantDrawCommands } from '../plantRenderers';

/**
 * Single source of truth for planting/container-layer metadata. Order = draw
 * order. Factory pulls label/alwaysOn/defaultVisible by id; the panel
 * imports the array for the "Plantings" group.
 */
export const PLANTING_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'container-overlays', label: 'Container Overlays' },
  { id: 'planting-conflicts', label: 'Spacing Conflicts' },
  { id: 'planting-spacing', label: 'Planting Spacing' },
  { id: 'planting-icons', label: 'Planting Icons', alwaysOn: true },
  { id: 'planting-measurements', label: 'Planting Measurements', defaultVisible: false },
  { id: 'planting-highlights', label: 'Planting Highlights' },
  { id: 'planting-labels', label: 'Planting Labels' },
  { id: 'container-walls', label: 'Container Walls' },
];

interface RenderedRect { x: number; y: number; w: number; h: number }

interface PlantingParent {
  x: number;
  y: number;
  width: number;
  length: number;
  shape?: string;
  layout: import('../../model/layout').Layout | null;
  wallThicknessFt?: number;
}

function px(view: View, p: number): number {
  return p / Math.max(0.0001, view.scale);
}

function rectsOverlap(a: RenderedRect, b: RenderedRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

interface ParentLookup {
  parentMap: Map<string, PlantingParent>;
  childCount: Map<string, number>;
  plantingsByParent: Map<string, Planting[]>;
}

function buildParentLookup(plantings: Planting[], zones: Zone[], structures: Structure[]): ParentLookup {
  const parentMap = new Map<string, PlantingParent>();
  for (const z of zones) parentMap.set(z.id, z as PlantingParent);
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s as PlantingParent);
  }

  const childCount = new Map<string, number>();
  const plantingsByParent = new Map<string, Planting[]>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(p);
    plantingsByParent.set(p.parentId, group);
  }
  return { parentMap, childCount, plantingsByParent };
}

function plantingRadius(p: Planting, parent: PlantingParent, childCount: Map<string, number>, plantIconScale: number): number {
  const cultivar = getCultivar(p.cultivarId);
  const footprint = cultivar?.footprintFt ?? 0.5;
  const isSingleFill = parent.layout?.type === 'single' && childCount.get(p.parentId) === 1;
  return isSingleFill
    ? (Math.min(parent.width, parent.length) / 2) * plantIconScale
    : (footprint / 2) * plantIconScale;
}


/**
 * Render a plant glyph as DrawCommands, translated to (wx, wy).
 */
function plantGlyphAt(
  cultivarId: string,
  wx: number,
  wy: number,
  radius: number,
  showFootprintCircles: boolean,
): DrawCommand[] {
  const cultivar = getCultivar(cultivarId);
  const color = cultivar?.color ?? '#4A7C59';
  const iconBgColor = showFootprintCircles
    ? (cultivar?.iconBgColor ?? null)
    : 'transparent';
  return plantDrawCommands(cultivarId, wx, wy, radius, color, iconBgColor);
}

export function createPlantingLayers(
  getPlantings: () => Planting[],
  getZones: () => Zone[],
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown>[] {
  const meta = descriptorById(PLANTING_LAYER_DESCRIPTORS);
  return [
    {
      ...meta['container-overlays'],
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap } = buildParentLookup(plantings, zones, structures);

        const occupied = new Map<string, Set<string>>();
        for (const p of plantings) {
          let set = occupied.get(p.parentId);
          if (!set) { set = new Set(); occupied.set(p.parentId, set); }
          set.add(`${p.x},${p.y}`);
        }

        const containers: { id: string; parent: PlantingParent }[] = [];
        for (const s of structures) {
          const parent = parentMap.get(s.id);
          if (parent) containers.push({ id: s.id, parent });
        }
        for (const z of zones) {
          const parent = parentMap.get(z.id);
          if (parent) containers.push({ id: z.id, parent });
        }

        const children: DrawCommand[] = [];
        for (const { id, parent } of containers) {
          if (!parent.layout) continue;
          const bounds = getPlantableBounds(parent);
          const occSet = occupied.get(id) ?? new Set<string>();
          const overlay = computeContainerOverlay(parent.layout, bounds, { occupiedSlots: occSet });

          for (const item of overlay.items) {
            if (item.type === 'slot-dot') {
              const r = px(view, 3);
              const color = item.occupied ? 'rgba(255,255,255,0.1)' : 'rgba(127,176,105,0.4)';
              children.push({
                kind: 'path',
                path: circlePolygon(item.x, item.y, r),
                fill: { fill: 'solid', color },
              });
            } else if (item.type === 'highlight-slot') {
              const r = Math.max(px(view, 3), item.radiusFt / 2);
              children.push({
                kind: 'path',
                path: circlePolygon(item.x, item.y, r),
                stroke: { paint: { fill: 'solid', color: 'rgba(127,176,105,0.8)' }, width: px(view, 2) },
              });
            } else if (item.type === 'grid-line') {
              const path = new PathBuilder()
                .moveTo(item.x1, item.y1)
                .lineTo(item.x2, item.y2)
                .build();
              children.push({
                kind: 'path',
                path,
                stroke: { paint: { fill: 'solid', color: 'rgba(0,0,0,0.18)' }, width: px(view, 1) },
              });
            }
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-conflicts'],
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const ui = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const ghost = ui.dragPlantingGhost ?? null;

        const children: DrawCommand[] = [];
        // Include any container that hosts plantings, OR the parent of an
        // in-flight palette-drop ghost (so its conflicts show up even when
        // the container has no real plantings yet).
        const parentIds = new Set<string>(plantingsByParent.keys());
        if (ghost) parentIds.add(ghost.parentId);

        for (const parentId of parentIds) {
          const parent = parentMap.get(parentId);
          if (!parent || parent.layout?.type !== 'cell-grid') continue;
          const bounds = getPlantableBounds(parent);
          const cellSize = parent.layout.cellSizeFt;
          const group = plantingsByParent.get(parentId) ?? [];
          const footprints = group
            .map((p) => resolveFootprint({ cultivarId: p.cultivarId, x: p.x, y: p.y }, parent.x, parent.y))
            .filter((f): f is NonNullable<typeof f> => f !== null);
          if (ghost && ghost.parentId === parentId) {
            const ghostFp = resolveFootprint(
              { cultivarId: ghost.cultivarId, x: ghost.x, y: ghost.y },
              parent.x, parent.y,
            );
            if (ghostFp) footprints.push(ghostFp);
          }
          const { validCells, footprintConflict, spacingConflict } = computeOccupancy({
            bounds, cellSizeFt: cellSize, plantings: footprints,
          });
          if (footprintConflict.size === 0 && spacingConflict.size === 0) continue;
          const cellByKey = new Map(validCells.map((c) => [`${c.col},${c.row}`, c]));
          // Yellow first, red on top so overlapping cells appear red.
          for (const k of spacingConflict) {
            const c = cellByKey.get(k);
            if (!c) continue;
            children.push({
              kind: 'path',
              path: rectPath(c.x - cellSize / 2, c.y - cellSize / 2, cellSize, cellSize),
              fill: { fill: 'solid', color: 'rgba(255, 215, 0, 0.35)' },
            });
          }
          for (const k of footprintConflict) {
            const c = cellByKey.get(k);
            if (!c) continue;
            children.push({
              kind: 'path',
              path: rectPath(c.x - cellSize / 2, c.y - cellSize / 2, cellSize, cellSize),
              fill: { fill: 'solid', color: 'rgba(220, 50, 50, 0.5)' },
            });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-spacing'],
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const children: DrawCommand[] = [];
        for (const [parentId, group] of plantingsByParent) {
          const parent = parentMap.get(parentId);
          if (!parent) continue;

          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            const spacing = cultivar?.spacingFt ?? 0.5;
            const isSingleFill = parent.layout?.type === 'single' && childCount.get(p.parentId) === 1;
            if (isSingleFill) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const spacingHalf = (spacing / 2) * data.plantIconScale;

            const path = parent.shape === 'circle'
              ? circlePolygon(wx, wy, spacingHalf)
              : rectPath(wx - spacingHalf, wy - spacingHalf, spacingHalf * 2, spacingHalf * 2);
            children.push({
              kind: 'path',
              path,
              stroke: {
                paint: { fill: 'solid', color: 'rgba(255, 255, 255, 0.3)' },
                width: px(view, 1),
                dash: [px(view, 4), px(view, 3)],
              },
            });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-icons'],
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const children: DrawCommand[] = [];
        for (const [parentId, group] of plantingsByParent) {
          const parent = parentMap.get(parentId);
          if (!parent) continue;

          for (const p of group) {
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), plantingRadius(p, parent, childCount, data.plantIconScale));
            children.push(...plantGlyphAt(p.cultivarId, wx, wy, radius, data.showFootprintCircles));
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-measurements'],
      // Flagged: text commands require registerFont() wired at app boot.
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const fontPx = 9 / Math.max(0.0001, view.scale);
        const children: DrawCommand[] = [];
        for (const [, group] of plantingsByParent) {
          const parent = parentMap.get(group[0]?.parentId ?? '');
          if (!parent) continue;
          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            if (!cultivar) continue;
            const footprint = cultivar.footprintFt ?? 0.5;
            const spacing = cultivar.spacingFt ?? 0.5;
            const isSingleFill = parent.layout?.type === 'single' && childCount.get(p.parentId) === 1;
            if (isSingleFill) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), (footprint / 2) * data.plantIconScale);
            const labelX = wx + radius + px(view, 3);
            children.push({
              kind: 'text',
              x: labelX,
              y: wy - px(view, 2),
              text: `${footprint.toFixed(1)}ft`,
              style: {
                fontSize: fontPx,
                align: 'left' as const,
                fill: { fill: 'solid' as const, color: 'rgba(255, 255, 255, 0.7)' },
              },
            });
            children.push({
              kind: 'text',
              x: labelX,
              y: wy + px(view, 8),
              text: `${spacing.toFixed(1)}ft`,
              style: {
                fontSize: fontPx,
                align: 'left' as const,
                fill: { fill: 'solid' as const, color: 'rgba(255, 255, 200, 0.5)' },
              },
            });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-highlights'],
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const children: DrawCommand[] = [];
        for (const [, group] of plantingsByParent) {
          const parent = parentMap.get(group[0]?.parentId ?? '');
          if (!parent) continue;
          for (const p of group) {
            const opacity = data.getHighlight(p.id);
            if (opacity <= 0) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), plantingRadius(p, parent, childCount, data.plantIconScale));
            children.push({
              kind: 'group',
              alpha: opacity,
              children: [{
                kind: 'path',
                path: circlePolygon(wx, wy, radius + px(view, 1)),
                stroke: { paint: { fill: 'solid', color: '#FFD700' }, width: px(view, 2) },
              }],
            });
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['planting-labels'],
      // Flagged: text commands require registerFont() wired at app boot.
      // NOTE(concern): Markdown label rendering (bold species name + italic variety)
      // previously used createMarkdownRenderer(ctx,...) which requires a canvas
      // context. Here we fall back to a plain text command with species+variety
      // concatenated. Full markdown rendering will need a DrawCommand-compatible
      // markdown renderer.
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const data = getUi();
        if (data.labelMode === 'none') return [];
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const fontPx = data.labelFontSize / Math.max(0.0001, view.scale);

        const labelOccluders: RenderedRect[] = [];
        const candidates: { text: string; rect: RenderedRect; selected: boolean }[] = [];

        for (const [, group] of plantingsByParent) {
          const parent = parentMap.get(group[0]?.parentId ?? '');
          if (!parent) continue;
          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            if (!cultivar) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), plantingRadius(p, parent, childCount, data.plantIconScale));
            const isSelected = data.selectedIds.includes(p.id);
            const showThis = data.labelMode === 'all' || data.labelMode === 'active-layer'
              || (data.labelMode === 'selection' && isSelected)
              || data.getHighlight(p.id) > 0;
            if (!showThis) continue;

            const species = getSpecies(cultivar.speciesId);
            const speciesName = species?.name ?? cultivar.name;
            const variety = cultivar.variety;
            const text = variety ? `${speciesName} (${variety})` : speciesName;
            // Approximate label width: 0.6× fontPx per char + 2×padX
            const padX = px(view, 4);
            const approxW = text.length * fontPx * 0.6 + padX * 2;
            const labelY = wy + radius + px(view, 8);
            candidates.push({
              text,
              rect: { x: wx - approxW / 2, y: labelY, w: approxW, h: fontPx },
              selected: isSelected,
            });
          }
        }

        const children: DrawCommand[] = [];
        for (const label of candidates) {
          if (!label.selected) {
            const overlaps = labelOccluders.some((r) => rectsOverlap(label.rect, r));
            if (overlaps) continue;
          }
          children.push({
            kind: 'text',
            x: label.rect.x + label.rect.w / 2,
            y: label.rect.y,
            text: label.text,
            style: {
              fontSize: fontPx,
              align: 'center' as const,
              fill: { fill: 'solid' as const, color: '#ffffff' },
            },
          });
          labelOccluders.push(label.rect);
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },

    {
      ...meta['container-walls'],
      // For containers with `clipChildren`, draw the wall AREA (not just the
      // inner rim stroke) on top of plantings so any icon overhang gets visually
      // clipped to the inner soil. The wall area is filled with the container's
      // color; an inner-rim stroke marks the soil/wall boundary on top.
      //
      // Rect walls: 4 strips (top/bottom/left/right). Circular walls: an
      // annulus polygon (outer ring vertices + inner ring vertices in reverse).
      draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
        const structures = getStructures();
        const children: DrawCommand[] = [];
        for (const s of structures) {
          if (!s.container || (s.wallThicknessFt ?? 0) <= 0) continue;
          const strokeColor = s.type === 'pot' ? '#8a3a18' : '#333333';
          const lw = px(view, 1);
          const wallWidth = s.wallThicknessFt;
          if (s.type === 'pot' || s.type === 'felt-planter') {
            const cx = s.x + s.width / 2;
            const cy = s.y + s.length / 2;
            const rOuter = Math.min(s.width, s.length) / 2;
            const rInner = rOuter - wallWidth;
            if (rInner > 0 && s.clipChildren !== false) {
              children.push(...annulusFill(cx, cy, rInner, rOuter, s.color));
            }
            if (rInner > 0) {
              children.push({
                kind: 'path',
                path: circlePolygon(cx, cy, rInner),
                stroke: { paint: { fill: 'solid', color: strokeColor }, width: lw },
              });
            }
          } else {
            const innerX = s.x + wallWidth;
            const innerY = s.y + wallWidth;
            const innerW = s.width - wallWidth * 2;
            const innerH = s.length - wallWidth * 2;
            if (innerW > 0 && innerH > 0 && s.clipChildren !== false) {
              // Four rectangular wall strips, filled with the container color.
              children.push(
                { kind: 'path', path: rectPath(s.x, s.y, s.width, wallWidth), fill: { fill: 'solid', color: s.color } },
                { kind: 'path', path: rectPath(s.x, s.y + s.length - wallWidth, s.width, wallWidth), fill: { fill: 'solid', color: s.color } },
                { kind: 'path', path: rectPath(s.x, innerY, wallWidth, innerH), fill: { fill: 'solid', color: s.color } },
                { kind: 'path', path: rectPath(s.x + s.width - wallWidth, innerY, wallWidth, innerH), fill: { fill: 'solid', color: s.color } },
              );
            }
            if (innerW > 0 && innerH > 0) {
              children.push({
                kind: 'path',
                path: rectPath(innerX, innerY, innerW, innerH),
                stroke: { paint: { fill: 'solid', color: strokeColor }, width: lw },
              });
            }
          }
        }
        return [{ kind: 'group', transform: viewToMat3(view), children }];
      },
    },
  ];
}

/**
 * Filled annulus (ring) drawn as a polygon with the outer ring vertices
 * followed by the inner ring vertices in reverse winding. Used to mask plant
 * icons that overhang circular pots/felt-planters.
 */
function annulusFill(cx: number, cy: number, rInner: number, rOuter: number, color: string): DrawCommand[] {
  const samples = 32;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * rOuter, y: cy + Math.sin(t) * rOuter });
  }
  for (let i = samples - 1; i >= 0; i--) {
    const t = (i / samples) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * rInner, y: cy + Math.sin(t) * rInner });
  }
  return [{
    kind: 'path',
    path: polygonFromPoints(pts),
    fill: { fill: 'solid', color },
  }];
}
