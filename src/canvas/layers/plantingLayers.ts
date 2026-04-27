import { computeContainerOverlay } from '../../model/containerOverlay';
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { getPlantableBounds } from '../../model/types';
import { getSpecies } from '../../model/species';
import { worldToScreen } from '../../utils/grid';
import type { ViewTransform } from '../../utils/grid';
import type { LabelMode } from '../../store/uiStore';
import { createMarkdownRenderer } from '../markdownText';
import type { TextRenderer } from '../renderLabel';
import { renderLabel } from '../renderLabel';
import { renderPlant } from '../plantRenderers';
import type { RenderLayer } from '../renderLayer';
import type { PlantingLayerData, PlantingParent, RenderedRect } from '../layerData';

function rectsOverlap(a: RenderedRect, b: RenderedRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Apply a clip path to the inner wall bounds of a container parent.
 * Returns true if clip was applied (caller must ctx.restore()).
 */
function applyContainerClip(
  ctx: CanvasRenderingContext2D,
  parent: PlantingParent,
  view: ViewTransform,
): boolean {
  const wall = parent.wallThicknessFt ?? 0;
  if (wall <= 0) return false;
  ctx.save();
  const [psx, psy] = worldToScreen(parent.x, parent.y, view);
  const psw = parent.width * view.zoom;
  const psh = parent.height * view.zoom;
  ctx.beginPath();
  if (parent.shape === 'circle') {
    const rimWidth = Math.max(1.5, wall * view.zoom);
    const cx = psx + psw / 2;
    const cy = psy + psh / 2;
    const r = Math.min(psw, psh) / 2 - rimWidth;
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
  } else {
    const wallWidth = Math.max(2, wall * view.zoom);
    ctx.rect(psx + wallWidth, psy + wallWidth, psw - wallWidth * 2, psh - wallWidth * 2);
  }
  ctx.clip();
  return true;
}

export function buildPlantingLayerData(
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number,
  labelMode: LabelMode | 'none',
  labelFontSize: number,
  selectedIds: string[],
  plantIconScale: number,
  showFootprintCircles: boolean = true,
): PlantingLayerData {
  // Build parent lookup map from zones and container structures
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone as PlantingParent);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s as PlantingParent);
  }

  // Count children per parent
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  // Group plantings by parent
  const plantingsByParent = new Map<string, Planting[]>();
  for (const p of plantings) {
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(p);
    plantingsByParent.set(p.parentId, group);
  }

  return {
    view,
    canvasWidth,
    canvasHeight,
    highlightOpacity,
    labelMode,
    labelFontSize,
    plantings,
    plantingsByParent,
    parentMap,
    childCount,
    structures,
    zones,
    selectedIds,
    plantIconScale,
    showFootprintCircles,
    labelOccluders: [],
  };
}

export const PLANTING_LAYERS: RenderLayer<PlantingLayerData>[] = [
  {
    id: 'container-overlays',
    label: 'Container Overlays',
    draw(ctx, data) {
      const { plantings, structures, zones, parentMap, view } = data;

      // Build occupied slot sets per parent
      const occupiedByParent = new Map<string, Set<string>>();
      for (const p of plantings) {
        let set = occupiedByParent.get(p.parentId);
        if (!set) { set = new Set(); occupiedByParent.set(p.parentId, set); }
        set.add(`${p.x},${p.y}`);
      }

      // Render overlays for each container
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
        const occupiedSlots = occupiedByParent.get(id) ?? new Set<string>();
        const overlay = computeContainerOverlay(parent.arrangement, bounds, { occupiedSlots });

        for (const item of overlay.items) {
          if (item.type === 'slot-dot') {
            const [sx, sy] = worldToScreen(item.x, item.y, view);
            const r = 3;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = item.occupied ? 'rgba(255,255,255,0.1)' : 'rgba(127,176,105,0.4)';
            ctx.fill();
          } else if (item.type === 'grid-line') {
            const [x1, y1] = worldToScreen(item.x1, item.y1, view);
            const [x2, y2] = worldToScreen(item.x2, item.y2, view);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = 'rgba(127,176,105,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (item.type === 'highlight-slot') {
            const [sx, sy] = worldToScreen(item.x, item.y, view);
            const r = Math.max(3, (item.radiusFt / 2) * view.zoom);
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(127,176,105,0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    },
  },

  {
    id: 'planting-spacing',
    label: 'Planting Spacing',
    draw(ctx, data) {
      const { plantingsByParent, parentMap, childCount, view, plantIconScale } = data;

      for (const [parentId, group] of plantingsByParent) {
        const parent = parentMap.get(parentId);
        if (!parent) continue;

        const clipped = applyContainerClip(ctx, parent, view);

        for (const p of group) {
          const cultivar = getCultivar(p.cultivarId);
          const spacing = cultivar?.spacingFt ?? 0.5;

          const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;
          if (isSingleFill) continue;

          const worldX = parent.x + p.x;
          const worldY = parent.y + p.y;
          const [sx, sy] = worldToScreen(worldX, worldY, view);
          const spacingHalf = (spacing / 2) * view.zoom * plantIconScale;

          ctx.save();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          if (parent.shape === 'circle') {
            ctx.arc(sx, sy, spacingHalf, 0, Math.PI * 2);
          } else {
            ctx.rect(sx - spacingHalf, sy - spacingHalf, spacingHalf * 2, spacingHalf * 2);
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
    id: 'planting-icons',
    label: 'Planting Icons',
    alwaysOn: true,
    draw(ctx, data) {
      const { plantingsByParent, parentMap, childCount, view, plantIconScale, showFootprintCircles } = data;

      for (const [parentId, group] of plantingsByParent) {
        const parent = parentMap.get(parentId);
        if (!parent) continue;

        const clipped = applyContainerClip(ctx, parent, view);

        for (const p of group) {
          const cultivar = getCultivar(p.cultivarId);
          const color = cultivar?.color ?? '#4A7C59';
          const footprint = cultivar?.footprintFt ?? 0.5;

          const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

          const worldX = parent.x + p.x;
          const worldY = parent.y + p.y;
          const [sx, sy] = worldToScreen(worldX, worldY, view);
          const radius = isSingleFill
            ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom * plantIconScale)
            : Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

          ctx.save();
          ctx.translate(sx, sy);
          renderPlant(ctx, p.cultivarId, radius, color, showFootprintCircles ? undefined : 'transparent');
          ctx.restore();
        }

        if (clipped) ctx.restore();
      }
    },
  },

  {
    id: 'planting-measurements',
    label: 'Planting Measurements',
    defaultVisible: false,
    draw(ctx, data) {
      const { plantingsByParent, parentMap, childCount, view, plantIconScale } = data;

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

          const worldX = parent.x + p.x;
          const worldY = parent.y + p.y;
          const [sx, sy] = worldToScreen(worldX, worldY, view);
          const radius = Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

          const ftLabel = `${footprint.toFixed(1)}ft`;
          const spLabel = `${spacing.toFixed(1)}ft`;
          ctx.save();
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillText(ftLabel, sx + radius + 3, sy - 2);
          ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
          ctx.fillText(spLabel, sx + radius + 3, sy + 8);
          ctx.restore();
        }
      }
    },
  },

  {
    id: 'planting-highlights',
    label: 'Planting Highlights',
    draw(ctx, data) {
      const { plantingsByParent, parentMap, childCount, view, plantIconScale, highlightOpacity } = data;
      if (highlightOpacity <= 0) return;

      for (const [, group] of plantingsByParent) {
        const parent = parentMap.get(group[0]?.parentId ?? '');
        if (!parent) continue;

        for (const p of group) {
          const cultivar = getCultivar(p.cultivarId);
          const footprint = cultivar?.footprintFt ?? 0.5;

          const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

          const worldX = parent.x + p.x;
          const worldY = parent.y + p.y;
          const [sx, sy] = worldToScreen(worldX, worldY, view);
          const radius = isSingleFill
            ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom * plantIconScale)
            : Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

          ctx.save();
          ctx.globalAlpha = highlightOpacity;
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  },

  {
    id: 'planting-labels',
    label: 'Planting Labels',
    draw(ctx, data) {
      const { plantingsByParent, parentMap, childCount, view, plantIconScale, labelMode, labelFontSize, selectedIds, highlightOpacity, labelOccluders } = data;
      if (labelMode === 'none') return;

      ctx.font = `${labelFontSize}px sans-serif`;

      const labelCandidates: {
        text: string;
        rect: RenderedRect;
        selected: boolean;
        renderText?: TextRenderer;
      }[] = [];

      for (const [, group] of plantingsByParent) {
        const parent = parentMap.get(group[0]?.parentId ?? '');
        if (!parent) continue;

        for (const p of group) {
          const cultivar = getCultivar(p.cultivarId);
          if (!cultivar) continue;
          const footprint = cultivar.footprintFt ?? 0.5;

          const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

          const worldX = parent.x + p.x;
          const worldY = parent.y + p.y;
          const [sx, sy] = worldToScreen(worldX, worldY, view);
          const radius = isSingleFill
            ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom * plantIconScale)
            : Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

          const isSelected = selectedIds.includes(p.id);
          const showThisLabel = labelMode === 'all' || labelMode === 'active-layer'
            || (labelMode === 'selection' && isSelected)
            || highlightOpacity > 0;
          if (!showThisLabel) continue;

          const species = getSpecies(cultivar.speciesId);
          const speciesName = species?.name ?? cultivar.name;
          const variety = cultivar.variety;
          const mdText = variety
            ? `[**${speciesName}**]\n(*${variety}*)`
            : `**${speciesName}**`;

          const { renderer: mdRenderer, width: labelW, height: labelH } =
            createMarkdownRenderer(ctx, mdText, labelFontSize);

          const padX = 4;
          const pillW = labelW + padX * 2;
          const labelY = sy + radius + 8;
          labelCandidates.push({
            text: mdText,
            rect: { x: sx - pillW / 2, y: labelY, w: pillW, h: labelH },
            selected: isSelected,
            renderText: (c, _text, tx, ty) => {
              c.textAlign = 'left';
              mdRenderer(c, _text, tx - labelW / 2, ty);
            },
          });
        }
      }

      // Render labels that don't overlap earlier labels; selected labels always render
      for (const label of labelCandidates) {
        if (!label.selected) {
          const overlaps = labelOccluders.some((r) => rectsOverlap(label.rect, r));
          if (overlaps) continue;
        }
        renderLabel(ctx, label.text, label.rect.x + label.rect.w / 2, label.rect.y, {
          renderText: label.renderText,
          width: label.rect.w - 8,
          height: label.rect.h,
        });
        // Mutable: append to shared occluders so later labels don't overlap
        labelOccluders.push(label.rect);
      }
    },
  },

  {
    id: 'container-walls',
    label: 'Container Walls',
    draw(ctx, data) {
      const { structures, view } = data;

      for (const s of structures) {
        if (!s.container || (s.wallThicknessFt ?? 0) <= 0) continue;
        const [sx, sy] = worldToScreen(s.x, s.y, view);
        const sw = s.width * view.zoom;
        const sh = s.height * view.zoom;
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        if (s.type === 'pot' || s.type === 'felt-planter') {
          const rimWidth = Math.max(1.5, s.wallThicknessFt * view.zoom);
          const cx = sx + sw / 2;
          const cy = sy + sh / 2;
          const r = Math.min(sw, sh) / 2 - rimWidth;
          if (r > 0) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          const wallWidth = Math.max(2, s.wallThicknessFt * view.zoom);
          ctx.strokeRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
        }
      }
    },
  },
];
