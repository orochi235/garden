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
  wallThicknessFt?: number;
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
    showSpacingBorders = true,
    showFootprintCircles = true,
    showMeasurements = false,
    plantIconScale = 1,
    overlays,
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

  // Collect label occluders — only used to prevent plant labels from overlapping each other
  const labelOccluders: RenderedRect[] = [];

  // Count plantings per parent to detect single-plant containers
  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  // First pass: render plants (clipped to container inner walls) and collect label candidates
  const labelCandidates: { text: string; rect: RenderedRect; selected: boolean; renderText?: TextRenderer }[] = [];

  // Group plantings by parent so we can apply a single clip per container
  const plantingsByParent = new Map<string, Planting[]>();
  for (const p of plantings) {
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(p);
    plantingsByParent.set(p.parentId, group);
  }

  for (const [parentId, group] of plantingsByParent) {
    const parent = parentMap.get(parentId);
    if (!parent) continue;

    // Clip rendering to the container's inner bounds (inside walls)
    const wall = parent.wallThicknessFt ?? 0;
    const clipped = wall > 0;
    if (clipped) {
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
    }

    for (const p of group) {
      const cultivar = getCultivar(p.cultivarId);
      const color = cultivar?.color ?? '#4A7C59';
      const footprint = cultivar?.footprintFt ?? 0.5;
      const spacing = cultivar?.spacingFt ?? 0.5;

      const isSingleFill = parent.arrangement?.type === 'single' && childCount.get(p.parentId) === 1;

      const worldX = parent.x + p.x;
      const worldY = parent.y + p.y;
      const [sx, sy] = worldToScreen(worldX, worldY, view);
      const radius = isSingleFill
        ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom * plantIconScale)
        : Math.max(3, (footprint / 2) * view.zoom * plantIconScale);

      const overlay = overlays?.get(p.id);

      // Draw spacing border
      if (showSpacingBorders && !isSingleFill) {
        const spacingHalf = (spacing / 2) * view.zoom * plantIconScale;
        const borderStroke = overlay?.spacingStroke ?? 'rgba(255, 255, 255, 0.3)';
        const borderOpacity = overlay?.spacingOpacity ?? 1;
        ctx.save();
        ctx.globalAlpha = borderOpacity;
        ctx.strokeStyle = borderStroke;
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

      // Draw highlight ring from overlay
      if (overlay?.highlightRing) {
        const ringRadius = (overlay.highlightRing.radiusFt / 2) * view.zoom * plantIconScale;
        ctx.save();
        ctx.strokeStyle = overlay.highlightRing.color;
        ctx.lineWidth = 1.5;
        if (overlay.highlightRing.dashPattern) {
          ctx.setLineDash(overlay.highlightRing.dashPattern);
        }
        ctx.beginPath();
        ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      const footprintFill = overlay?.footprintFill ?? null;
      const footprintOpacity = overlay?.footprintOpacity ?? 1;

      ctx.save();
      ctx.translate(sx, sy);
      if (footprintOpacity !== 1) ctx.globalAlpha = footprintOpacity;
      renderPlant(ctx, p.cultivarId, radius, color, showFootprintCircles ? (footprintFill ?? undefined) : 'transparent');
      ctx.restore();

      // Draw measurement labels
      if (showMeasurements && !isSingleFill) {
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

      if (highlightOpacity > 0) {
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

    if (clipped) {
      ctx.restore();
    }

    // Collect label candidates outside the clip so they aren't cut off
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
      if (showThisLabel) {
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

  // Redraw container inner borders on top of plants so walls aren't obscured
  for (const s of structures) {
    if (!s.container || s.wallThicknessFt <= 0) continue;
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

  // Group by parent for container clipping
  const plantingsByParent = new Map<string, Planting[]>();
  for (const p of plantings) {
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(p);
    plantingsByParent.set(p.parentId, group);
  }

  for (const [parentId, group] of plantingsByParent) {
    const parent = parentMap.get(parentId);
    if (!parent) continue;

    const wall = parent.wallThicknessFt ?? 0;
    const clipped = wall > 0;
    if (clipped) {
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
    }

    for (const p of group) {
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

      const cultivarBgColor = cultivar?.iconBgColor ?? null;
      ctx.save();
      if (snapped) ctx.globalAlpha = 0.4;
      ctx.translate(sx, sy);
      renderPlant(ctx, p.cultivarId, radius, color, cultivarBgColor);
      ctx.restore();

      if (snapped) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    if (clipped) {
      ctx.restore();
    }
  }
}
