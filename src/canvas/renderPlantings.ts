import type { Arrangement } from '../model/arrangement';
import { getCultivar } from '../model/cultivars';
import type { Planting, Structure, Zone } from '../model/types';
import { getSpecies } from '../model/species';
import { worldToScreen } from '../utils/grid';
import { createMarkdownRenderer } from './markdownText';
import type { TextRenderer } from './renderLabel';
import { renderLabel } from './renderLabel';
import type { OverlayRenderOptions, PlantingRenderOptions } from './renderOptions';
import { renderPlant } from './plantRenderers';

interface PlantingParent {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  arrangement: Arrangement | null;
}

interface RenderedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: RenderedRect, b: RenderedRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function renderPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  opts: PlantingRenderOptions,
): void {
  const {
    view,
    canvasWidth,
    canvasHeight,
    highlightOpacity = 0,
    labelMode = 'none',
    labelFontSize = 13,
    selectedIds = [],
    showSpacing = false,
    plantIconScale = 1,
  } = opts;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (plantings.length === 0) return;

  // Build parent lookup map from zones and container structures
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  ctx.font = `${labelFontSize}px sans-serif`;

  // Collect occupied rects from structures and zones (used for label overlap culling)
  const labelOccluders: RenderedRect[] = [];
  for (const s of structures) {
    const [sx2, sy2] = worldToScreen(s.x, s.y, view);
    labelOccluders.push({ x: sx2, y: sy2, w: s.width * view.zoom, h: s.height * view.zoom });
  }
  for (const z of zones) {
    const [zx, zy] = worldToScreen(z.x, z.y, view);
    labelOccluders.push({ x: zx, y: zy, w: z.width * view.zoom, h: z.height * view.zoom });
  }

  // Count plantings per parent to detect single-plant containers
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  // First pass: render plants and collect their bounding rects
  const labelCandidates: { text: string; rect: RenderedRect; selected: boolean; renderText?: TextRenderer }[] = [];

  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);
    const color = cultivar?.color ?? '#4A7C59';
    const footprint = cultivar?.footprintFt ?? 0.5;
    const spacing = cultivar?.spacingFt ?? 0.5;

    // When a single-arrangement container has exactly one plant, fill the container
    const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

    const worldX = parent.x + p.x;
    const worldY = parent.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);
    const radius = isSingleFill
      ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom * plantIconScale)
      : Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

    if (showSpacing) {
      const spacingHalf = (spacing / 2) * view.zoom;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - spacingHalf, sy - spacingHalf, spacingHalf * 2, spacingHalf * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const shape = isSingleFill && parent.shape === 'circle' ? 'circle' as const : 'square' as const;

    ctx.save();
    ctx.translate(sx, sy);
    renderPlant(ctx, p.cultivarId, radius, color, shape);
    ctx.restore();

    if (highlightOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = highlightOpacity;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
      } else {
        ctx.rect(sx - radius - 1, sy - radius - 1, (radius + 1) * 2, (radius + 1) * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Track the plant's bounding box (not used for label occlusion)

    const isSelected = selectedIds.includes(p.id);
    const showThisLabel = labelMode === 'all' || labelMode === 'active-layer'
      || (labelMode === 'selection' && isSelected)
      || highlightOpacity > 0;
    if (showThisLabel && cultivar) {
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

  // Second pass: render labels that don't overlap structures, zones, or other labels
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
    // Add label to occluders so later labels don't overlap it
    labelOccluders.push(label.rect);
  }

}

export function renderOverlayPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  opts: OverlayRenderOptions,
): void {
  const { view, snapped } = opts;

  if (plantings.length === 0) return;

  // Build parent lookup map from zones and container structures
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  // Count plantings per parent to detect single-plant containers
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);
    const color = cultivar?.color ?? '#4A7C59';
    const footprint = cultivar?.footprintFt ?? 0.5;

    const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

    // Overlay plantings already have world coords — don't add parent offset
    const worldX = p.x;
    const worldY = p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);
    const radius = isSingleFill
      ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom)
      : Math.max(3, (footprint / 2) * view.zoom);

    const shape = isSingleFill && parent.shape === 'circle' ? 'circle' as const : 'square' as const;

    ctx.save();
    if (snapped) ctx.globalAlpha = 0.4;
    ctx.translate(sx, sy);
    renderPlant(ctx, p.cultivarId, radius, color, shape);
    ctx.restore();

    if (snapped) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
      } else {
        ctx.rect(sx - radius - 1, sy - radius - 1, (radius + 1) * 2, (radius + 1) * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}
