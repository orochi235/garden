import { FILL_COLORS } from '../model/types';
import type { Structure } from '../model/types';
import { worldToScreen } from '../utils/grid';
import { renderLabel } from './renderLabel';
import { renderPatternOverlay } from './patterns';
import type { StructureRenderOptions } from './renderOptions';

/** Render a single ungrouped structure with fill, stroke, and decorations. */
function renderSingle(
  ctx: CanvasRenderingContext2D,
  s: Structure,
  opts: StructureRenderOptions,
): void {
  const { view, showPlantableArea = false } = opts;
  const [sx, sy] = worldToScreen(s.x, s.y, view);
  const sw = s.width * view.zoom;
  const sh = s.height * view.zoom;

  ctx.fillStyle = s.color;
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;

  if (s.type === 'pot' || s.type === 'felt-planter') {
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    const r = Math.min(sw, sh) / 2;
    const rimWidth = Math.max(1.5, s.wallThicknessFt * view.zoom);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r - rimWidth, r - rimWidth, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s.fill === 'potting-mix') {
      const innerD = (r - rimWidth) * 2;
      renderPatternOverlay(ctx, 'chunks', {
        x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
      }, { params: { bg: FILL_COLORS[s.fill] } });
    }
    if (showPlantableArea) {
      const innerD = (r - rimWidth) * 2;
      renderPatternOverlay(ctx, 'hatch', {
        x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
      }, { params: { color: '#00FF00' } });
    }
  } else if (s.type === 'raised-bed') {
    const wallWidth = Math.max(2, s.wallThicknessFt * view.zoom);
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = s.fill ? FILL_COLORS[s.fill] : '#5C4033';
    ctx.fillRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
    ctx.strokeRect(sx + wallWidth, sy + wallWidth, sw - wallWidth * 2, sh - wallWidth * 2);
    if (s.fill === 'potting-mix') {
      renderPatternOverlay(ctx, 'chunks', {
        x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
      }, { params: { bg: FILL_COLORS[s.fill] } });
    }
    if (showPlantableArea) {
      renderPatternOverlay(ctx, 'hatch', {
        x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
      }, { params: { color: '#00FF00' } });
    }
  } else if (s.shape === 'circle') {
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!s.surface) ctx.stroke();
  } else {
    ctx.fillRect(sx, sy, sw, sh);
    if (!s.surface) ctx.strokeRect(sx, sy, sw, sh);
  }

  renderDecorations(ctx, s, sx, sy, sw, sh, opts);
}

/** Render highlight, surface overlay, and label for a structure. */
function renderDecorations(
  ctx: CanvasRenderingContext2D,
  s: Structure,
  sx: number, sy: number, sw: number, sh: number,
  opts: StructureRenderOptions,
): void {
  const { highlightOpacity = 0, showSurfaces = false } = opts;

  if (highlightOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = highlightOpacity;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    if (s.shape === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(sx, sy, sw, sh);
    }
    ctx.restore();
  }

  if (showSurfaces && s.surface) {
    renderPatternOverlay(ctx, 'hatch', {
      x: sx, y: sy, w: sw, h: sh,
      shape: s.shape === 'circle' ? 'circle' : 'rectangle',
    });
  }
}

/** Render a group of structures as a single compound shape (unified fill, outer stroke only). */
function renderGroup(
  ctx: CanvasRenderingContext2D,
  members: Structure[],
  opts: StructureRenderOptions,
): void {
  const { view, showSurfaces = false, highlightOpacity = 0 } = opts;

  // Build compound path from all members
  const compoundPath = new Path2D();
  const screenRects: { s: Structure; sx: number; sy: number; sw: number; sh: number }[] = [];

  for (const s of members) {
    const [sx, sy] = worldToScreen(s.x, s.y, view);
    const sw = s.width * view.zoom;
    const sh = s.height * view.zoom;
    screenRects.push({ s, sx, sy, sw, sh });

    if (s.shape === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      compoundPath.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    } else {
      compoundPath.rect(sx, sy, sw, sh);
    }
  }

  // Fill the compound shape (uses first member's color — grouped structures share appearance)
  const color = members[0].color;
  ctx.fillStyle = color;
  ctx.fill(compoundPath);

  // Skip stroke for surface-only groups (paths, patios)
  const allSurfaces = members.every((m) => m.surface);

  if (!allSurfaces) {
    // Stroke outer boundary only — clip out the interior so internal edges aren't drawn
    ctx.save();
    const inverse = new Path2D();
    inverse.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    inverse.addPath(compoundPath);
    ctx.clip(inverse, 'evenodd');
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.stroke(compoundPath);
    ctx.restore();
  }

  // Per-member decorations (highlights, surfaces, labels)
  for (const { s, sx, sy, sw, sh } of screenRects) {
    if (showSurfaces && s.surface) {
      renderPatternOverlay(ctx, 'hatch', {
        x: sx, y: sy, w: sw, h: sh,
        shape: s.shape === 'circle' ? 'circle' : 'rectangle',
      });
    }
  }

  // Group highlight
  if (highlightOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = highlightOpacity;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    // Use same inverse-clip trick for highlight stroke
    const highlightInverse = new Path2D();
    highlightInverse.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    highlightInverse.addPath(compoundPath);
    ctx.clip(highlightInverse, 'evenodd');
    ctx.lineWidth = 4;
    ctx.stroke(compoundPath);
    ctx.restore();
  }
}

export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  opts: StructureRenderOptions,
): void {
  const { canvasWidth, canvasHeight, skipClear = false } = opts;

  if (!skipClear) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (structures.length === 0) return;

  const sorted = [...structures].sort((a, b) => a.zIndex - b.zIndex);

  // Separate grouped vs ungrouped structures
  const groups = new Map<string, Structure[]>();
  const ungrouped: Structure[] = [];
  const groupOrder = new Map<string, number>(); // track first appearance for render order

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.groupId) {
      const members = groups.get(s.groupId);
      if (members) {
        members.push(s);
      } else {
        groups.set(s.groupId, [s]);
        groupOrder.set(s.groupId, i);
      }
    } else {
      ungrouped.push(s);
    }
  }

  // Interleave groups and ungrouped by their sort order
  interface RenderItem { type: 'single'; structure: Structure; order: number }
  interface RenderGroup { type: 'group'; members: Structure[]; order: number }
  const renderQueue: (RenderItem | RenderGroup)[] = [];

  for (const s of ungrouped) {
    renderQueue.push({ type: 'single', structure: s, order: sorted.indexOf(s) });
  }
  for (const [groupId, members] of groups) {
    renderQueue.push({ type: 'group', members, order: groupOrder.get(groupId)! });
  }
  renderQueue.sort((a, b) => a.order - b.order);

  // Pass 1: render bodies (fill, stroke, patterns, highlights, surfaces)
  for (const item of renderQueue) {
    if (item.type === 'single') {
      renderSingle(ctx, item.structure, opts);
    } else {
      renderGroup(ctx, item.members, opts);
    }
  }

  // Pass 2: render labels on top of all bodies
  const { view, labelMode = 'none', labelFontSize = 13, debugOverlappingLabels = false } = opts;
  if (labelMode !== 'none' && labelMode !== 'selection') {
    // Measure all labels first to detect overlaps
    const padX = 4;
    const padY = 1;
    ctx.save();
    ctx.font = `${labelFontSize}px sans-serif`;

    interface LabelEntry { label: string; x: number; y: number; w: number; h: number }
    const entries: LabelEntry[] = [];

    for (const item of renderQueue) {
      const members = item.type === 'single' ? [item.structure] : item.members;
      for (const s of members) {
        if (!s.label) continue;
        const [sx, sy] = worldToScreen(s.x, s.y, view);
        const sw = s.width * view.zoom;
        const sh = s.height * view.zoom;
        const cx = sx + sw / 2;
        const ly = sy + sh + 4;
        const tw = ctx.measureText(s.label).width + padX * 2;
        const th = labelFontSize + padY * 2;
        entries.push({ label: s.label, x: cx - tw / 2, y: ly - padY, w: tw, h: th });
      }
    }
    ctx.restore();

    // Mark which labels overlap an earlier (higher-priority) label
    const hidden = new Set<number>();
    for (let i = 0; i < entries.length; i++) {
      if (hidden.has(i)) continue;
      const a = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        if (hidden.has(j)) continue;
        const b = entries[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          hidden.add(j);
        }
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isHidden = hidden.has(i);
      if (isHidden && !debugOverlappingLabels) continue;
      if (isHidden) {
        ctx.save();
        ctx.globalAlpha = 0.4;
      }
      renderLabel(ctx, e.label, e.x + e.w / 2, e.y + padY, { fontSize: labelFontSize });
      if (isHidden) ctx.restore();
    }
  }
}
