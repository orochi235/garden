import { computeContainerOverlay } from '../../model/containerOverlay';
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { getPlantableBounds } from '../../model/types';
import { getSpecies } from '../../model/species';
import { createMarkdownRenderer, renderLabel, type TextRenderer } from '@orochi235/weasel';
import type { RenderLayer } from '@orochi235/weasel';
import { renderPlant } from '../plantRenderers';
import { plantingWorldPose } from '../../utils/plantingPose';
import type { GetUi, LayerDescriptor, View } from './worldLayerData';
import { descriptorById } from './worldLayerData';

/**
 * Single source of truth for planting/container-layer metadata. Order = draw
 * order. Factory pulls label/alwaysOn/defaultVisible by id; the panel
 * imports the array for the "Plantings" group.
 */
export const PLANTING_LAYER_DESCRIPTORS: readonly LayerDescriptor[] = [
  { id: 'container-overlays', label: 'Container Overlays' },
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
  height: number;
  shape?: string;
  arrangement: import('../../model/arrangement').Arrangement | null;
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

function applyContainerClip(ctx: CanvasRenderingContext2D, parent: PlantingParent, view: View): boolean {
  const wall = parent.wallThicknessFt ?? 0;
  if (wall <= 0) return false;
  ctx.save();
  ctx.beginPath();
  if (parent.shape === 'circle') {
    const rimWidth = Math.max(px(view, 1.5), wall);
    const cx = parent.x + parent.width / 2;
    const cy = parent.y + parent.height / 2;
    const r = Math.min(parent.width, parent.height) / 2 - rimWidth;
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
  } else {
    const wallWidth = Math.max(px(view, 2), wall);
    ctx.rect(parent.x + wallWidth, parent.y + wallWidth, parent.width - wallWidth * 2, parent.height - wallWidth * 2);
  }
  ctx.clip();
  return true;
}

function plantingRadius(p: Planting, parent: PlantingParent, childCount: Map<string, number>, plantIconScale: number): number {
  const cultivar = getCultivar(p.cultivarId);
  const footprint = cultivar?.footprintFt ?? 0.5;
  const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;
  return isSingleFill
    ? (Math.min(parent.width, parent.height) / 2) * plantIconScale
    : (footprint / 2) * plantIconScale;
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
      draw(ctx, _data, view) {
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

        for (const { id, parent } of containers) {
          if (!parent.arrangement || parent.arrangement.type === 'free') continue;
          const bounds = getPlantableBounds(parent);
          const occSet = occupied.get(id) ?? new Set<string>();
          const overlay = computeContainerOverlay(parent.arrangement, bounds, { occupiedSlots: occSet });

          for (const item of overlay.items) {
            if (item.type === 'slot-dot') {
              const r = px(view, 3);
              ctx.beginPath();
              ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
              ctx.fillStyle = item.occupied ? 'rgba(255,255,255,0.1)' : 'rgba(127,176,105,0.4)';
              ctx.fill();
            } else if (item.type === 'grid-line') {
              ctx.beginPath();
              ctx.moveTo(item.x1, item.y1);
              ctx.lineTo(item.x2, item.y2);
              ctx.strokeStyle = 'rgba(127,176,105,0.15)';
              ctx.lineWidth = px(view, 1);
              ctx.stroke();
            } else if (item.type === 'highlight-slot') {
              const r = Math.max(px(view, 3), item.radiusFt / 2);
              ctx.beginPath();
              ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(127,176,105,0.8)';
              ctx.lineWidth = px(view, 2);
              ctx.stroke();
            }
          }
        }
      },
    },

    {
      ...meta['planting-spacing'],
      draw(ctx, _data, view) {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        for (const [parentId, group] of plantingsByParent) {
          const parent = parentMap.get(parentId);
          if (!parent) continue;
          const clipped = applyContainerClip(ctx, parent, view);

          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            const spacing = cultivar?.spacingFt ?? 0.5;
            const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;
            if (isSingleFill) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const spacingHalf = (spacing / 2) * data.plantIconScale;

            ctx.save();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = px(view, 1);
            ctx.setLineDash([px(view, 4), px(view, 3)]);
            ctx.beginPath();
            if (parent.shape === 'circle') {
              ctx.arc(wx, wy, spacingHalf, 0, Math.PI * 2);
            } else {
              ctx.rect(wx - spacingHalf, wy - spacingHalf, spacingHalf * 2, spacingHalf * 2);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
          if (clipped) ctx.restore();
        }
      },
    },

    {
      ...meta['planting-icons'],
      draw(ctx, _data, view) {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        for (const [parentId, group] of plantingsByParent) {
          const parent = parentMap.get(parentId);
          if (!parent) continue;
          const clipped = applyContainerClip(ctx, parent, view);

          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            const color = cultivar?.color ?? '#4A7C59';
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), plantingRadius(p, parent, childCount, data.plantIconScale));

            ctx.save();
            ctx.translate(wx, wy);
            renderPlant(ctx, p.cultivarId, radius, color, data.showFootprintCircles ? undefined : 'transparent');
            ctx.restore();
          }
          if (clipped) ctx.restore();
        }
      },
    },

    {
      ...meta['planting-measurements'],
      draw(ctx, _data, view) {
        const data = getUi();
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        for (const [, group] of plantingsByParent) {
          const parent = parentMap.get(group[0]?.parentId ?? '');
          if (!parent) continue;
          for (const p of group) {
            const cultivar = getCultivar(p.cultivarId);
            if (!cultivar) continue;
            const footprint = cultivar.footprintFt ?? 0.5;
            const spacing = cultivar.spacingFt ?? 0.5;
            const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;
            if (isSingleFill) continue;
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), (footprint / 2) * data.plantIconScale);

            const fontPx = 9 / Math.max(0.0001, view.scale);
            ctx.save();
            ctx.font = `${fontPx}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(`${footprint.toFixed(1)}ft`, wx + radius + px(view, 3), wy - px(view, 2));
            ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
            ctx.fillText(`${spacing.toFixed(1)}ft`, wx + radius + px(view, 3), wy + px(view, 8));
            ctx.restore();
          }
        }
      },
    },

    {
      ...meta['planting-highlights'],
      draw(ctx, _data, view) {
        const data = getUi();
        if (data.highlightOpacity <= 0) return;
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        for (const [, group] of plantingsByParent) {
          const parent = parentMap.get(group[0]?.parentId ?? '');
          if (!parent) continue;
          for (const p of group) {
            const { x: wx, y: wy } = plantingWorldPose({ structures, zones }, p);
            const radius = Math.max(px(view, 3), plantingRadius(p, parent, childCount, data.plantIconScale));
            ctx.save();
            ctx.globalAlpha = data.highlightOpacity;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = px(view, 2);
            ctx.beginPath();
            ctx.arc(wx, wy, radius + px(view, 1), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      },
    },

    {
      ...meta['planting-labels'],
      draw(ctx, _data, view) {
        const data = getUi();
        if (data.labelMode === 'none') return;
        const plantings = getPlantings();
        const zones = getZones();
        const structures = getStructures();
        const { parentMap, childCount, plantingsByParent } = buildParentLookup(plantings, zones, structures);

        const fontPx = data.labelFontSize / Math.max(0.0001, view.scale);
        ctx.font = `${fontPx}px sans-serif`;

        const labelOccluders: RenderedRect[] = [];
        const candidates: { text: string; rect: RenderedRect; selected: boolean; renderText?: TextRenderer }[] = [];

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
              || data.highlightOpacity > 0;
            if (!showThis) continue;

            const species = getSpecies(cultivar.speciesId);
            const speciesName = species?.name ?? cultivar.name;
            const variety = cultivar.variety;
            const mdText = variety
              ? `[**${speciesName}**]\n(*${variety}*)`
              : `**${speciesName}**`;
            const { renderer: mdRenderer, width: labelW, height: labelH } =
              createMarkdownRenderer(ctx, mdText, fontPx);
            const padX = px(view, 4);
            const pillW = labelW + padX * 2;
            const labelY = wy + radius + px(view, 8);
            candidates.push({
              text: mdText,
              rect: { x: wx - pillW / 2, y: labelY, w: pillW, h: labelH },
              selected: isSelected,
              renderText: (c, _t, tx, ty) => {
                c.textAlign = 'left';
                mdRenderer(c, _t, tx - labelW / 2, ty);
              },
            });
          }
        }

        for (const label of candidates) {
          if (!label.selected) {
            const overlaps = labelOccluders.some((r) => rectsOverlap(label.rect, r));
            if (overlaps) continue;
          }
          renderLabel(ctx, label.text, label.rect.x + label.rect.w / 2, label.rect.y, {
            fontSize: fontPx,
            padX: px(view, 4),
            padY: px(view, 1),
            cornerRadius: px(view, 3),
            renderText: label.renderText,
            width: label.rect.w - px(view, 8),
            height: label.rect.h,
          });
          labelOccluders.push(label.rect);
        }
      },
    },

    {
      ...meta['container-walls'],
      // Inner rim stroke (at the soil/wall boundary), drawn AFTER plantings so
      // it visually crops plant icons that overhang the soil edge. The outer
      // rim stroke + rim fill live in `structure-walls`; this layer is only
      // the inner edge.
      draw(ctx, _data, view) {
        const structures = getStructures();
        for (const s of structures) {
          if (!s.container || (s.wallThicknessFt ?? 0) <= 0) continue;
          ctx.strokeStyle = s.type === 'pot' ? '#8a3a18' : '#333333';
          ctx.lineWidth = px(view, 1);
          if (s.type === 'pot' || s.type === 'felt-planter') {
            const rimWidth = Math.max(px(view, 1.5), s.wallThicknessFt);
            const cx = s.x + s.width / 2;
            const cy = s.y + s.height / 2;
            const r = Math.min(s.width, s.height) / 2 - rimWidth;
            if (r > 0) {
              ctx.beginPath();
              ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else {
            const wallWidth = Math.max(px(view, 2), s.wallThicknessFt);
            ctx.strokeRect(s.x + wallWidth, s.y + wallWidth, s.width - wallWidth * 2, s.height - wallWidth * 2);
          }
        }
      },
    },
  ];
}
