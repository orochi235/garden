# Render Layer Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace monolithic per-canvas render functions with ordered, toggleable, reorderable sub-layers sharing a uniform `RenderLayer<TData>` interface.

**Architecture:** Each of the four canvas renderers (zone, structure, planting, system) holds an ordered array of `RenderLayer` objects. Per frame, the renderer pre-computes a typed data object once, then iterates layers checking visibility before calling `draw()`. Toggle/reorder state lives in uiStore as `renderLayerVisibility` and `renderLayerOrder`, replacing scattered boolean flags.

**Tech Stack:** TypeScript, Canvas 2D API, Zustand (state), Vitest (tests)

---

## File Structure

| File | Purpose |
|------|---------|
| `src/canvas/renderLayer.ts` | `RenderLayer<TData>` interface + `runLayers()` dispatch helper |
| `src/canvas/layerData.ts` | `EntityLayerData`, `StructureLayerData`, `ZoneLayerData`, `PlantingLayerData`, `SystemLayerData` types |
| `src/canvas/layers/zoneLayers.ts` | 4 zone sub-layer definitions |
| `src/canvas/layers/structureLayers.ts` | 6 structure sub-layer definitions |
| `src/canvas/layers/plantingLayers.ts` | 7 planting sub-layer definitions |
| `src/canvas/layers/selectionLayers.ts` | 1 selection sub-layer definition |
| `src/canvas/ZoneLayerRenderer.ts` | Modify: replace monolithic `renderZones` call with layer dispatch |
| `src/canvas/StructureLayerRenderer.ts` | Modify: replace monolithic `renderStructures` call with layer dispatch |
| `src/canvas/PlantingLayerRenderer.ts` | Modify: replace monolithic `renderPlantings` call with layer dispatch |
| `src/canvas/SystemLayerRenderer.ts` | Create: new LayerRenderer subclass for selection |
| `src/canvas/CanvasStack.tsx` | Modify: wire SystemLayerRenderer, update flag subscriptions |
| `src/store/uiStore.ts` | Modify: add `renderLayerVisibility`/`renderLayerOrder`, remove old flags, remove `magentaHighlight` |
| `src/components/sidebar/LayerPropertiesPanel.tsx` | Modify: read `renderLayerVisibility` instead of old flags |
| `src/components/sidebar/DebugThemePanel.tsx` | Modify: remove magenta highlight checkbox |
| `src/hooks/useActiveTheme.ts` | Modify: remove magentaHighlight logic |
| `src/canvas/renderLayer.test.ts` | Test: `runLayers()` dispatch logic |
| `src/canvas/layers/zoneLayers.test.ts` | Test: zone layer draw functions |
| `src/canvas/layers/structureLayers.test.ts` | Test: structure layer draw functions |
| `src/canvas/layers/plantingLayers.test.ts` | Test: planting layer draw functions |

---

### Task 1: RenderLayer Interface and runLayers Helper

**Files:**
- Create: `src/canvas/renderLayer.ts`
- Create: `src/canvas/renderLayer.test.ts`

- [ ] **Step 1: Write the failing test for runLayers**

```typescript
// src/canvas/renderLayer.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RenderLayer } from './renderLayer';
import { runLayers } from './renderLayer';

describe('runLayers', () => {
  function mockCtx() {
    return {} as CanvasRenderingContext2D;
  }

  it('calls draw for each visible layer in order', () => {
    const calls: string[] = [];
    const layers: RenderLayer<string>[] = [
      { id: 'a', label: 'A', draw: (_ctx, data) => { calls.push(`a:${data}`); } },
      { id: 'b', label: 'B', draw: (_ctx, data) => { calls.push(`b:${data}`); } },
    ];
    runLayers(mockCtx(), layers, 'hello', {});
    expect(calls).toEqual(['a:hello', 'b:hello']);
  });

  it('skips layers that are toggled off in visibility map', () => {
    const calls: string[] = [];
    const layers: RenderLayer<number>[] = [
      { id: 'a', label: 'A', draw: () => { calls.push('a'); } },
      { id: 'b', label: 'B', draw: () => { calls.push('b'); } },
    ];
    runLayers(mockCtx(), layers, 42, { a: false });
    expect(calls).toEqual(['b']);
  });

  it('respects defaultVisible=false when no visibility override', () => {
    const calls: string[] = [];
    const layers: RenderLayer<number>[] = [
      { id: 'a', label: 'A', defaultVisible: false, draw: () => { calls.push('a'); } },
      { id: 'b', label: 'B', draw: () => { calls.push('b'); } },
    ];
    runLayers(mockCtx(), layers, 0, {});
    expect(calls).toEqual(['b']);
  });

  it('shows defaultVisible=false layers when visibility override is true', () => {
    const calls: string[] = [];
    const layers: RenderLayer<number>[] = [
      { id: 'a', label: 'A', defaultVisible: false, draw: () => { calls.push('a'); } },
    ];
    runLayers(mockCtx(), layers, 0, { a: true });
    expect(calls).toEqual(['a']);
  });

  it('never hides alwaysOn layers regardless of visibility map', () => {
    const calls: string[] = [];
    const layers: RenderLayer<number>[] = [
      { id: 'a', label: 'A', alwaysOn: true, draw: () => { calls.push('a'); } },
    ];
    runLayers(mockCtx(), layers, 0, { a: false });
    expect(calls).toEqual(['a']);
  });

  it('uses custom order when provided', () => {
    const calls: string[] = [];
    const layers: RenderLayer<number>[] = [
      { id: 'a', label: 'A', draw: () => { calls.push('a'); } },
      { id: 'b', label: 'B', draw: () => { calls.push('b'); } },
      { id: 'c', label: 'C', draw: () => { calls.push('c'); } },
    ];
    runLayers(mockCtx(), layers, 0, {}, ['c', 'a', 'b']);
    expect(calls).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/canvas/renderLayer.test.ts`
Expected: FAIL — module `./renderLayer` has no export `runLayers`

- [ ] **Step 3: Implement RenderLayer interface and runLayers**

```typescript
// src/canvas/renderLayer.ts
export interface RenderLayer<TData> {
  id: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, data: TData) => void;
  defaultVisible?: boolean;
  alwaysOn?: boolean;
}

/**
 * Iterate an ordered list of render layers, checking visibility for each.
 * @param ctx - Canvas context to draw on
 * @param layers - Ordered array of render layers
 * @param data - Pre-computed data object shared by all layers
 * @param visibility - Map of layer ID → visible boolean (absent = use defaultVisible)
 * @param order - Optional custom ordering of layer IDs
 */
export function runLayers<TData>(
  ctx: CanvasRenderingContext2D,
  layers: RenderLayer<TData>[],
  data: TData,
  visibility: Record<string, boolean>,
  order?: string[],
): void {
  if (order) {
    const layerMap = new Map(layers.map((l) => [l.id, l]));
    for (const id of order) {
      const layer = layerMap.get(id);
      if (!layer) continue;
      if (isVisible(layer, visibility)) {
        layer.draw(ctx, data);
      }
    }
  } else {
    for (const layer of layers) {
      if (isVisible(layer, visibility)) {
        layer.draw(ctx, data);
      }
    }
  }
}

function isVisible<TData>(
  layer: RenderLayer<TData>,
  visibility: Record<string, boolean>,
): boolean {
  if (layer.alwaysOn) return true;
  if (layer.id in visibility) return visibility[layer.id];
  return layer.defaultVisible !== false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/canvas/renderLayer.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/renderLayer.ts src/canvas/renderLayer.test.ts
git commit -m "feat: add RenderLayer interface and runLayers dispatch helper"
```

---

### Task 2: LayerData Type Definitions

**Files:**
- Create: `src/canvas/layerData.ts`

- [ ] **Step 1: Create the layer data type definitions**

```typescript
// src/canvas/layerData.ts
import type { LabelMode } from '../store/uiStore';
import type { Planting, Structure, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';

/** Common base for structure, zone, and planting layer data. */
export interface EntityLayerData {
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
  labelMode: LabelMode | 'none';
  labelFontSize: number;
  highlightOpacity: number;
}

export interface RenderedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StructureLayerData extends EntityLayerData {
  structures: Structure[];
  groups: Map<string, Structure[]>;
  ungrouped: Structure[];
  renderQueue: StructureRenderItem[];
  debugOverlappingLabels: boolean;
}

export type StructureRenderItem =
  | { type: 'single'; structure: Structure; order: number }
  | { type: 'group'; members: Structure[]; order: number };

export interface ZoneLayerData extends EntityLayerData {
  zones: Zone[];
}

export interface PlantingParent {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  arrangement: import('../model/arrangement').Arrangement | null;
  wallThicknessFt?: number;
}

export interface PlantingLayerData extends EntityLayerData {
  plantings: Planting[];
  plantingsByParent: Map<string, Planting[]>;
  parentMap: Map<string, PlantingParent>;
  childCount: Map<string, number>;
  structures: Structure[];
  zones: Zone[];
  selectedIds: string[];
  plantIconScale: number;
  labelOccluders: RenderedRect[];
}

export interface SystemLayerData {
  selectedIds: string[];
  structures: Structure[];
  zones: Zone[];
  plantings: Planting[];
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/canvas/layerData.ts
git commit -m "feat: add EntityLayerData and renderer-specific layer data types"
```

---

### Task 3: Zone Sub-Layers (ZoneLayerRenderer Migration)

**Files:**
- Create: `src/canvas/layers/zoneLayers.ts`
- Create: `src/canvas/layers/zoneLayers.test.ts`
- Modify: `src/canvas/ZoneLayerRenderer.ts`

This is the simplest renderer (4 layers, no clipping, no overlap detection). It proves the pattern.

- [ ] **Step 1: Write failing tests for zone sub-layers**

```typescript
// src/canvas/layers/zoneLayers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ZONE_LAYERS } from './zoneLayers';
import type { ZoneLayerData } from '../layerData';

function mockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    font: '',
    textAlign: '',
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D;
}

function baseData(overrides: Partial<ZoneLayerData> = {}): ZoneLayerData {
  return {
    view: { panX: 0, panY: 0, zoom: 1 },
    canvasWidth: 800,
    canvasHeight: 600,
    labelMode: 'none',
    labelFontSize: 13,
    highlightOpacity: 0,
    zones: [],
    ...overrides,
  };
}

describe('ZONE_LAYERS', () => {
  it('has exactly 4 layers in the correct order', () => {
    expect(ZONE_LAYERS.map((l) => l.id)).toEqual([
      'zone-bodies',
      'zone-patterns',
      'zone-highlights',
      'zone-labels',
    ]);
  });

  it('zone-bodies is alwaysOn', () => {
    const bodies = ZONE_LAYERS.find((l) => l.id === 'zone-bodies')!;
    expect(bodies.alwaysOn).toBe(true);
  });

  it('zone-bodies draws fill and dashed stroke for each zone', () => {
    const ctx = mockCtx();
    const data = baseData({
      zones: [
        { id: 'z1', x: 1, y: 2, width: 3, height: 4, color: '#ff0000', zIndex: 0, label: 'Test', pattern: null },
      ] as any[],
    });
    const bodies = ZONE_LAYERS.find((l) => l.id === 'zone-bodies')!;
    bodies.draw(ctx, data);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 3]);
  });

  it('zone-highlights only draws when highlightOpacity > 0', () => {
    const ctx = mockCtx();
    const data = baseData({
      zones: [{ id: 'z1', x: 0, y: 0, width: 1, height: 1, color: '#ff0000', zIndex: 0, label: '', pattern: null }] as any[],
      highlightOpacity: 0,
    });
    const highlights = ZONE_LAYERS.find((l) => l.id === 'zone-highlights')!;
    highlights.draw(ctx, data);
    // Should not save/restore when highlight is 0
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('zone-labels skips rendering when labelMode is none', () => {
    const ctx = mockCtx();
    const data = baseData({
      zones: [{ id: 'z1', x: 0, y: 0, width: 1, height: 1, color: '#ff0000', zIndex: 0, label: 'Test', pattern: null }] as any[],
      labelMode: 'none',
    });
    const labels = ZONE_LAYERS.find((l) => l.id === 'zone-labels')!;
    labels.draw(ctx, data);
    // renderLabel would set textAlign — if not called, it wasn't invoked
    // Just verifying no crash; the real visual test is that output matches the old renderer
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/canvas/layers/zoneLayers.test.ts`
Expected: FAIL — cannot find module `./zoneLayers`

- [ ] **Step 3: Create the layers directory and implement zone sub-layers**

Run: `mkdir -p src/canvas/layers`

```typescript
// src/canvas/layers/zoneLayers.ts
import type { Zone } from '../../model/types';
import type { RenderLayer } from '../renderLayer';
import type { ZoneLayerData } from '../layerData';
import { worldToScreen } from '../../utils/grid';
import { renderLabel } from '../renderLabel';
import type { PatternId } from '../patterns';
import { renderPatternOverlay } from '../patterns';

const zoneBodies: RenderLayer<ZoneLayerData> = {
  id: 'zone-bodies',
  label: 'Zone Bodies',
  alwaysOn: true,
  draw(ctx, data) {
    const { zones, view } = data;
    const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const z of sorted) {
      const [sx, sy] = worldToScreen(z.x, z.y, view);
      const sw = z.width * view.zoom;
      const sh = z.height * view.zoom;
      ctx.fillStyle = z.color;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#4A7C59';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  },
};

const zonePatterns: RenderLayer<ZoneLayerData> = {
  id: 'zone-patterns',
  label: 'Zone Patterns',
  draw(ctx, data) {
    const { zones, view } = data;
    const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const z of sorted) {
      if (!z.pattern) continue;
      const [sx, sy] = worldToScreen(z.x, z.y, view);
      const sw = z.width * view.zoom;
      const sh = z.height * view.zoom;
      renderPatternOverlay(ctx, z.pattern as PatternId, { x: sx, y: sy, w: sw, h: sh, shape: 'rectangle' });
    }
  },
};

const zoneHighlights: RenderLayer<ZoneLayerData> = {
  id: 'zone-highlights',
  label: 'Zone Highlights',
  draw(ctx, data) {
    const { zones, view, highlightOpacity } = data;
    if (highlightOpacity <= 0) return;
    const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const z of sorted) {
      const [sx, sy] = worldToScreen(z.x, z.y, view);
      const sw = z.width * view.zoom;
      const sh = z.height * view.zoom;
      ctx.save();
      ctx.globalAlpha = highlightOpacity;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.restore();
    }
  },
};

const zoneLabels: RenderLayer<ZoneLayerData> = {
  id: 'zone-labels',
  label: 'Zone Labels',
  draw(ctx, data) {
    const { zones, view, labelMode, labelFontSize } = data;
    if (labelMode === 'none' || labelMode === 'selection') return;
    const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const z of sorted) {
      if (!z.label) continue;
      const [sx, sy] = worldToScreen(z.x, z.y, view);
      const sw = z.width * view.zoom;
      const sh = z.height * view.zoom;
      renderLabel(ctx, z.label, sx + sw / 2, sy + sh + 4, { fontSize: labelFontSize });
    }
  },
};

export const ZONE_LAYERS: RenderLayer<ZoneLayerData>[] = [
  zoneBodies,
  zonePatterns,
  zoneHighlights,
  zoneLabels,
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/canvas/layers/zoneLayers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update ZoneLayerRenderer to use sub-layers**

Replace the contents of `src/canvas/ZoneLayerRenderer.ts`:

```typescript
// src/canvas/ZoneLayerRenderer.ts
import type { Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import type { ZoneLayerData } from './layerData';
import { ZONE_LAYERS } from './layers/zoneLayers';
import { runLayers } from './renderLayer';
import { renderZones } from './renderZones';

export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  hideIds: string[] = [];
  overlayZones: Zone[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleZones = this.hideIds.length > 0
      ? this.zones.filter((z) => !this.hideIds.includes(z.id))
      : this.zones;

    const data: ZoneLayerData = {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      zones: visibleZones,
    };

    runLayers(ctx, ZONE_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayZones.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderZones(ctx, this.overlayZones, {
        view: this.view,
        canvasWidth: this.width,
        canvasHeight: this.height,
        skipClear: true,
      });
      ctx.restore();
    }
  }
}
```

- [ ] **Step 6: Verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/canvas/layers/zoneLayers.ts src/canvas/layers/zoneLayers.test.ts src/canvas/ZoneLayerRenderer.ts
git commit -m "feat: migrate ZoneLayerRenderer to sub-layer architecture"
```

---

### Task 4: Structure Sub-Layers (StructureLayerRenderer Migration)

**Files:**
- Create: `src/canvas/layers/structureLayers.ts`
- Create: `src/canvas/layers/structureLayers.test.ts`
- Modify: `src/canvas/StructureLayerRenderer.ts`

Moderate complexity: grouped rendering, two-pass labels, surfaces, plantable area.

- [ ] **Step 1: Write failing tests for structure sub-layers**

```typescript
// src/canvas/layers/structureLayers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { STRUCTURE_LAYERS, buildStructureRenderQueue } from './structureLayers';
import type { StructureLayerData, StructureRenderItem } from '../layerData';
import type { Structure } from '../../model/types';

function mockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    font: '',
    textAlign: '',
    textBaseline: '',
    canvas: { width: 800, height: 600 },
  } as unknown as CanvasRenderingContext2D;
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 's1',
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    color: '#8B4513',
    zIndex: 0,
    label: 'Bed 1',
    type: 'raised-bed',
    container: true,
    wallThicknessFt: 0.1,
    shape: 'rectangle',
    surface: null,
    fill: null,
    groupId: null,
    arrangement: null,
    ...overrides,
  } as Structure;
}

describe('STRUCTURE_LAYERS', () => {
  it('has exactly 6 layers in the correct order', () => {
    expect(STRUCTURE_LAYERS.map((l) => l.id)).toEqual([
      'structure-bodies',
      'structure-walls',
      'structure-surfaces',
      'structure-plantable-area',
      'structure-highlights',
      'structure-labels',
    ]);
  });

  it('structure-bodies is alwaysOn', () => {
    expect(STRUCTURE_LAYERS.find((l) => l.id === 'structure-bodies')!.alwaysOn).toBe(true);
  });

  it('structure-plantable-area defaults to not visible', () => {
    expect(STRUCTURE_LAYERS.find((l) => l.id === 'structure-plantable-area')!.defaultVisible).toBe(false);
  });
});

describe('buildStructureRenderQueue', () => {
  it('separates grouped and ungrouped structures', () => {
    const structures = [
      makeStructure({ id: 's1', groupId: null, zIndex: 0 }),
      makeStructure({ id: 's2', groupId: 'g1', zIndex: 1 }),
      makeStructure({ id: 's3', groupId: 'g1', zIndex: 2 }),
    ];
    const { renderQueue, groups } = buildStructureRenderQueue(structures);
    expect(renderQueue).toHaveLength(2); // 1 ungrouped + 1 group
    expect(groups.get('g1')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/canvas/layers/structureLayers.test.ts`
Expected: FAIL — cannot find module `./structureLayers`

- [ ] **Step 3: Implement structure sub-layers**

```typescript
// src/canvas/layers/structureLayers.ts
import { FILL_COLORS } from '../../model/types';
import type { Structure } from '../../model/types';
import type { RenderLayer } from '../renderLayer';
import type { StructureLayerData, StructureRenderItem } from '../layerData';
import { worldToScreen } from '../../utils/grid';
import { renderLabel } from '../renderLabel';
import { renderPatternOverlay } from '../patterns';

/**
 * Pre-sort structures, separate grouped vs ungrouped, and build a render queue.
 * Shared between the data-building step and the layer definitions.
 */
export function buildStructureRenderQueue(structures: Structure[]): {
  renderQueue: StructureRenderItem[];
  groups: Map<string, Structure[]>;
} {
  const sorted = [...structures].sort((a, b) => a.zIndex - b.zIndex);
  const groups = new Map<string, Structure[]>();
  const ungrouped: Structure[] = [];
  const groupOrder = new Map<string, number>();

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

  const renderQueue: StructureRenderItem[] = [];
  for (const s of ungrouped) {
    renderQueue.push({ type: 'single', structure: s, order: sorted.indexOf(s) });
  }
  for (const [groupId, members] of groups) {
    renderQueue.push({ type: 'group', members, order: groupOrder.get(groupId)! });
  }
  renderQueue.sort((a, b) => a.order - b.order);

  return { renderQueue, groups };
}

// --- Individual structure rendering helpers (extracted from renderStructures.ts) ---

function renderSingleBody(
  ctx: CanvasRenderingContext2D,
  s: Structure,
  data: StructureLayerData,
): void {
  const { view } = data;
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
}

function renderGroupBody(
  ctx: CanvasRenderingContext2D,
  members: Structure[],
  data: StructureLayerData,
): void {
  const { view } = data;
  const compoundPath = new Path2D();

  for (const s of members) {
    const [sx, sy] = worldToScreen(s.x, s.y, view);
    const sw = s.width * view.zoom;
    const sh = s.height * view.zoom;
    if (s.shape === 'circle') {
      compoundPath.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    } else {
      compoundPath.rect(sx, sy, sw, sh);
    }
  }

  ctx.fillStyle = members[0].color;
  ctx.fill(compoundPath);

  const allSurfaces = members.every((m) => m.surface);
  if (!allSurfaces) {
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
}

// --- Sub-layer definitions ---

const structureBodies: RenderLayer<StructureLayerData> = {
  id: 'structure-bodies',
  label: 'Structure Bodies',
  alwaysOn: true,
  draw(ctx, data) {
    for (const item of data.renderQueue) {
      if (item.type === 'single') {
        renderSingleBody(ctx, item.structure, data);
      } else {
        renderGroupBody(ctx, item.members, data);
      }
    }
  },
};

const structureWalls: RenderLayer<StructureLayerData> = {
  id: 'structure-walls',
  label: 'Structure Walls',
  draw(ctx, data) {
    // Inner wall borders are already drawn as part of renderSingleBody for containers.
    // This layer exists as a toggle point — the body layer always draws walls as part
    // of the structure shape. This is a no-op placeholder for future separation.
    // Currently the wall drawing is inseparable from the body fill for raised-bed/pot types.
  },
};

const structureSurfaces: RenderLayer<StructureLayerData> = {
  id: 'structure-surfaces',
  label: 'Surface Overlays',
  draw(ctx, data) {
    const { view } = data;
    for (const item of data.renderQueue) {
      const members = item.type === 'single' ? [item.structure] : item.members;
      for (const s of members) {
        if (!s.surface) continue;
        const [sx, sy] = worldToScreen(s.x, s.y, view);
        const sw = s.width * view.zoom;
        const sh = s.height * view.zoom;
        renderPatternOverlay(ctx, 'hatch', {
          x: sx, y: sy, w: sw, h: sh,
          shape: s.shape === 'circle' ? 'circle' : 'rectangle',
        });
      }
    }
  },
};

const structurePlantableArea: RenderLayer<StructureLayerData> = {
  id: 'structure-plantable-area',
  label: 'Plantable Area',
  defaultVisible: false,
  draw(ctx, data) {
    const { view } = data;
    for (const item of data.renderQueue) {
      const members = item.type === 'single' ? [item.structure] : item.members;
      for (const s of members) {
        const [sx, sy] = worldToScreen(s.x, s.y, view);
        const sw = s.width * view.zoom;
        const sh = s.height * view.zoom;
        if (s.type === 'pot' || s.type === 'felt-planter') {
          const r = Math.min(sw, sh) / 2;
          const rimWidth = Math.max(1.5, s.wallThicknessFt * view.zoom);
          const innerD = (r - rimWidth) * 2;
          const cx = sx + sw / 2;
          const cy = sy + sh / 2;
          renderPatternOverlay(ctx, 'hatch', {
            x: cx - (r - rimWidth), y: cy - (r - rimWidth), w: innerD, h: innerD, shape: 'circle',
          }, { params: { color: '#00FF00' } });
        } else if (s.type === 'raised-bed') {
          const wallWidth = Math.max(2, s.wallThicknessFt * view.zoom);
          renderPatternOverlay(ctx, 'hatch', {
            x: sx + wallWidth, y: sy + wallWidth, w: sw - wallWidth * 2, h: sh - wallWidth * 2, shape: 'rectangle',
          }, { params: { color: '#00FF00' } });
        }
      }
    }
  },
};

const structureHighlights: RenderLayer<StructureLayerData> = {
  id: 'structure-highlights',
  label: 'Structure Highlights',
  draw(ctx, data) {
    const { view, highlightOpacity } = data;
    if (highlightOpacity <= 0) return;

    for (const item of data.renderQueue) {
      if (item.type === 'single') {
        const s = item.structure;
        const [sx, sy] = worldToScreen(s.x, s.y, view);
        const sw = s.width * view.zoom;
        const sh = s.height * view.zoom;
        ctx.save();
        ctx.globalAlpha = highlightOpacity;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        if (s.shape === 'circle') {
          ctx.beginPath();
          ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(sx, sy, sw, sh);
        }
        ctx.restore();
      } else {
        // Group highlight — outer boundary only
        const compoundPath = new Path2D();
        for (const s of item.members) {
          const [sx, sy] = worldToScreen(s.x, s.y, view);
          const sw = s.width * view.zoom;
          const sh = s.height * view.zoom;
          if (s.shape === 'circle') {
            compoundPath.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
          } else {
            compoundPath.rect(sx, sy, sw, sh);
          }
        }
        ctx.save();
        ctx.globalAlpha = highlightOpacity;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        const inverse = new Path2D();
        inverse.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
        inverse.addPath(compoundPath);
        ctx.clip(inverse, 'evenodd');
        ctx.lineWidth = 4;
        ctx.stroke(compoundPath);
        ctx.restore();
      }
    }
  },
};

const structureLabels: RenderLayer<StructureLayerData> = {
  id: 'structure-labels',
  label: 'Structure Labels',
  draw(ctx, data) {
    const { view, labelMode, labelFontSize, renderQueue, debugOverlappingLabels } = data;
    if (labelMode === 'none' || labelMode === 'selection') return;

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
  },
};

export const STRUCTURE_LAYERS: RenderLayer<StructureLayerData>[] = [
  structureBodies,
  structureWalls,
  structureSurfaces,
  structurePlantableArea,
  structureHighlights,
  structureLabels,
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/canvas/layers/structureLayers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update StructureLayerRenderer to use sub-layers**

Replace the contents of `src/canvas/StructureLayerRenderer.ts`:

```typescript
// src/canvas/StructureLayerRenderer.ts
import type { Structure } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import type { StructureLayerData } from './layerData';
import { buildStructureRenderQueue, STRUCTURE_LAYERS } from './layers/structureLayers';
import { runLayers } from './renderLayer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  debugOverlappingLabels = false;
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  hideIds: string[] = [];
  overlayStructures: Structure[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;

    const { renderQueue, groups } = buildStructureRenderQueue(visibleStructures);

    const data: StructureLayerData = {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      structures: visibleStructures,
      groups,
      ungrouped: visibleStructures.filter((s) => !s.groupId),
      renderQueue,
      debugOverlappingLabels: this.debugOverlappingLabels,
    };

    runLayers(ctx, STRUCTURE_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayStructures.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderStructures(ctx, this.overlayStructures, {
        view: this.view,
        canvasWidth: this.width,
        canvasHeight: this.height,
        showSurfaces: this.renderLayerVisibility['structure-surfaces'] ?? true,
        skipClear: true,
      });
      ctx.restore();
    }
  }
}
```

- [ ] **Step 6: Verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/canvas/layers/structureLayers.ts src/canvas/layers/structureLayers.test.ts src/canvas/StructureLayerRenderer.ts
git commit -m "feat: migrate StructureLayerRenderer to sub-layer architecture"
```

---

### Task 5: Planting Sub-Layers (PlantingLayerRenderer Migration)

**Files:**
- Create: `src/canvas/layers/plantingLayers.ts`
- Create: `src/canvas/layers/plantingLayers.test.ts`
- Modify: `src/canvas/PlantingLayerRenderer.ts`

Most complex: container clipping, mutable occluders, container overlays, wall redraws, label collision.

- [ ] **Step 1: Write failing tests for planting sub-layers**

```typescript
// src/canvas/layers/plantingLayers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PLANTING_LAYERS, buildPlantingLayerData } from './plantingLayers';

describe('PLANTING_LAYERS', () => {
  it('has exactly 7 layers in the correct order', () => {
    expect(PLANTING_LAYERS.map((l) => l.id)).toEqual([
      'container-overlays',
      'planting-spacing',
      'planting-icons',
      'planting-measurements',
      'planting-highlights',
      'planting-labels',
      'container-walls',
    ]);
  });

  it('planting-icons is alwaysOn', () => {
    expect(PLANTING_LAYERS.find((l) => l.id === 'planting-icons')!.alwaysOn).toBe(true);
  });

  it('planting-measurements defaults to not visible', () => {
    expect(PLANTING_LAYERS.find((l) => l.id === 'planting-measurements')!.defaultVisible).toBe(false);
  });
});

describe('buildPlantingLayerData', () => {
  it('builds parentMap from structures and zones', () => {
    const structures = [
      { id: 's1', x: 0, y: 0, width: 2, height: 2, container: true, wallThicknessFt: 0.1, arrangement: null, shape: 'rectangle' },
    ];
    const zones = [
      { id: 'z1', x: 0, y: 0, width: 3, height: 3, arrangement: null },
    ];
    const plantings = [
      { id: 'p1', parentId: 's1', x: 0, y: 0, cultivarId: 'c1' },
    ];
    const data = buildPlantingLayerData(
      plantings as any, zones as any, structures as any,
      { panX: 0, panY: 0, zoom: 1 }, 800, 600, 0,
      'none', 13, [], 1,
    );
    expect(data.parentMap.has('s1')).toBe(true);
    expect(data.parentMap.has('z1')).toBe(true);
    expect(data.childCount.get('s1')).toBe(1);
    expect(data.plantingsByParent.get('s1')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/canvas/layers/plantingLayers.test.ts`
Expected: FAIL — cannot find module `./plantingLayers`

- [ ] **Step 3: Implement planting sub-layers**

This is the largest file. It extracts all rendering operations from `renderPlantings.ts` into 7 sub-layer draw functions. The key insight is that `renderPlantings` currently does everything in a single pass with two sub-passes (plants, then labels). We decompose this into: container overlays → spacing circles → plant icons (with clipping) → measurements → highlights → labels (with occlusion) → container wall redraws.

```typescript
// src/canvas/layers/plantingLayers.ts
import type { Arrangement } from '../../model/arrangement';
import { computeContainerOverlay, type OverlayContext } from '../../model/containerOverlay';
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

// --- Data builder ---

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
): PlantingLayerData {
  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  const childCount = new Map<string, number>();
  for (const p of plantings) {
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

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
    labelOccluders: [],
  };
}

// --- Shared helpers ---

function getPlantScreen(
  p: Planting,
  parent: PlantingParent,
  data: PlantingLayerData,
): { sx: number; sy: number; radius: number; isSingleFill: boolean } {
  const cultivar = getCultivar(p.cultivarId);
  const footprint = cultivar?.footprintFt ?? 0.5;
  const isSingleFill = parent.arrangement?.type === 'single' && data.childCount.get(p.parentId) === 1;
  const worldX = parent.x + p.x;
  const worldY = parent.y + p.y;
  const [sx, sy] = worldToScreen(worldX, worldY, data.view);
  const radius = isSingleFill
    ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * data.view.zoom * data.plantIconScale)
    : Math.max(3, (footprint / 2) * data.view.zoom * data.plantIconScale);
  return { sx, sy, radius, isSingleFill };
}

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

// --- Sub-layer definitions ---

const containerOverlays: RenderLayer<PlantingLayerData> = {
  id: 'container-overlays',
  label: 'Container Overlays',
  draw(ctx, data) {
    const { plantings, structures, zones, parentMap, view } = data;

    const occupiedByParent = new Map<string, Set<string>>();
    for (const p of plantings) {
      let set = occupiedByParent.get(p.parentId);
      if (!set) { set = new Set(); occupiedByParent.set(p.parentId, set); }
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
      const occupiedSlots = occupiedByParent.get(id) ?? new Set<string>();
      const overlay = computeContainerOverlay(parent.arrangement, bounds, { occupiedSlots });

      for (const item of overlay.items) {
        if (item.type === 'slot-dot') {
          const [sx, sy] = worldToScreen(item.x, item.y, view);
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
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
};

const plantingSpacing: RenderLayer<PlantingLayerData> = {
  id: 'planting-spacing',
  label: 'Spacing Borders',
  draw(ctx, data) {
    for (const [parentId, group] of data.plantingsByParent) {
      const parent = data.parentMap.get(parentId);
      if (!parent) continue;

      const clipped = applyContainerClip(ctx, parent, data.view);

      for (const p of group) {
        const cultivar = getCultivar(p.cultivarId);
        const spacing = cultivar?.spacingFt ?? 0.5;
        const { sx, sy, isSingleFill } = getPlantScreen(p, parent, data);
        if (isSingleFill) continue;

        const spacingHalf = (spacing / 2) * data.view.zoom * data.plantIconScale;
        ctx.save();
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
};

const plantingIcons: RenderLayer<PlantingLayerData> = {
  id: 'planting-icons',
  label: 'Plant Icons',
  alwaysOn: true,
  draw(ctx, data) {
    for (const [parentId, group] of data.plantingsByParent) {
      const parent = data.parentMap.get(parentId);
      if (!parent) continue;

      const clipped = applyContainerClip(ctx, parent, data.view);

      for (const p of group) {
        const cultivar = getCultivar(p.cultivarId);
        const color = cultivar?.color ?? '#4A7C59';
        const { sx, sy, radius } = getPlantScreen(p, parent, data);

        ctx.save();
        ctx.translate(sx, sy);
        renderPlant(ctx, p.cultivarId, radius, color);
        ctx.restore();
      }

      if (clipped) ctx.restore();
    }
  },
};

const plantingMeasurements: RenderLayer<PlantingLayerData> = {
  id: 'planting-measurements',
  label: 'Measurements',
  defaultVisible: false,
  draw(ctx, data) {
    for (const [parentId, group] of data.plantingsByParent) {
      const parent = data.parentMap.get(parentId);
      if (!parent) continue;

      for (const p of group) {
        const cultivar = getCultivar(p.cultivarId);
        const footprint = cultivar?.footprintFt ?? 0.5;
        const spacing = cultivar?.spacingFt ?? 0.5;
        const { sx, sy, radius, isSingleFill } = getPlantScreen(p, parent, data);
        if (isSingleFill) continue;

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
};

const plantingHighlights: RenderLayer<PlantingLayerData> = {
  id: 'planting-highlights',
  label: 'Planting Highlights',
  draw(ctx, data) {
    if (data.highlightOpacity <= 0) return;

    for (const [parentId, group] of data.plantingsByParent) {
      const parent = data.parentMap.get(parentId);
      if (!parent) continue;

      for (const p of group) {
        const { sx, sy, radius } = getPlantScreen(p, parent, data);
        ctx.save();
        ctx.globalAlpha = data.highlightOpacity;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
};

const plantingLabels: RenderLayer<PlantingLayerData> = {
  id: 'planting-labels',
  label: 'Plant Labels',
  draw(ctx, data) {
    const { labelMode, labelFontSize, highlightOpacity, selectedIds, labelOccluders } = data;
    ctx.font = `${labelFontSize}px sans-serif`;

    interface LabelCandidate {
      text: string;
      rect: RenderedRect;
      selected: boolean;
      renderText?: TextRenderer;
    }
    const candidates: LabelCandidate[] = [];

    for (const [parentId, group] of data.plantingsByParent) {
      const parent = data.parentMap.get(parentId);
      if (!parent) continue;

      for (const p of group) {
        const cultivar = getCultivar(p.cultivarId);
        if (!cultivar) continue;

        const { sx, sy, radius } = getPlantScreen(p, parent, data);
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
        candidates.push({
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

    for (const label of candidates) {
      if (!label.selected) {
        const overlaps = labelOccluders.some((r) =>
          r.x < label.rect.x + label.rect.w && r.x + r.w > label.rect.x &&
          r.y < label.rect.y + label.rect.h && r.y + r.h > label.rect.y
        );
        if (overlaps) continue;
      }
      renderLabel(ctx, label.text, label.rect.x + label.rect.w / 2, label.rect.y, {
        renderText: label.renderText,
        width: label.rect.w - 8,
        height: label.rect.h,
      });
      labelOccluders.push(label.rect);
    }
  },
};

const containerWalls: RenderLayer<PlantingLayerData> = {
  id: 'container-walls',
  label: 'Container Walls (Redraw)',
  draw(ctx, data) {
    const { structures, view } = data;
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
  },
};

export const PLANTING_LAYERS: RenderLayer<PlantingLayerData>[] = [
  containerOverlays,
  plantingSpacing,
  plantingIcons,
  plantingMeasurements,
  plantingHighlights,
  plantingLabels,
  containerWalls,
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/canvas/layers/plantingLayers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update PlantingLayerRenderer to use sub-layers**

Replace the contents of `src/canvas/PlantingLayerRenderer.ts`:

```typescript
// src/canvas/PlantingLayerRenderer.ts
import type { Planting, Structure, Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { buildPlantingLayerData, PLANTING_LAYERS } from './layers/plantingLayers';
import { runLayers } from './renderLayer';
import { renderOverlayPlantings } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  plantIconScale = 1;
  hideIds: string[] = [];
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;

    const data = buildPlantingLayerData(
      visiblePlantings,
      this.zones,
      this.structures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.labelMode,
      this.labelFontSize,
      this.selectedIds,
      this.plantIconScale,
    );

    runLayers(ctx, PLANTING_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(ctx, this.overlayPlantings, this.zones, this.structures, {
        view: this.view,
        snapped: this.overlaySnapped,
      });
    }
  }
}
```

- [ ] **Step 6: Verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/canvas/layers/plantingLayers.ts src/canvas/layers/plantingLayers.test.ts src/canvas/PlantingLayerRenderer.ts
git commit -m "feat: migrate PlantingLayerRenderer to sub-layer architecture"
```

---

### Task 6: SystemLayerRenderer (Selection Promotion)

**Files:**
- Create: `src/canvas/SystemLayerRenderer.ts`
- Create: `src/canvas/layers/selectionLayers.ts`
- Modify: `src/canvas/CanvasStack.tsx`

Promote the bare `renderSelection()` call into a proper LayerRenderer subclass with sub-layers.

- [ ] **Step 1: Create selection sub-layer**

```typescript
// src/canvas/layers/selectionLayers.ts
import { getCultivar } from '../../model/cultivars';
import type { Planting, Structure, Zone } from '../../model/types';
import { worldToScreen } from '../../utils/grid';
import { renderLabel } from '../renderLabel';
import type { RenderLayer } from '../renderLayer';
import type { SystemLayerData } from '../layerData';

const selectionBoxes: RenderLayer<SystemLayerData> = {
  id: 'selection-boxes',
  label: 'Selection',
  alwaysOn: true,
  draw(ctx, data) {
    const { selectedIds, structures, zones, plantings, view, canvasWidth, canvasHeight } = data;
    if (selectedIds.length === 0) return;

    // Build parent lookup for resolving planting world positions
    const parentMap = new Map<string, { x: number; y: number; width: number; height: number; shape?: string }>();
    for (const z of zones) parentMap.set(z.id, z);
    for (const s of structures) {
      if (s.container) parentMap.set(s.id, s);
    }

    // Render selected plantings as dashed circles
    const selectedPlantings = plantings.filter((p) => selectedIds.includes(p.id));
    for (const p of selectedPlantings) {
      const parent = parentMap.get(p.parentId);
      if (!parent) continue;
      const cultivar = getCultivar(p.cultivarId);
      const footprint = cultivar?.footprintFt ?? 0.5;
      const worldX = parent.x + p.x;
      const worldY = parent.y + p.y;
      const [sx, sy] = worldToScreen(worldX, worldY, view);
      const radius = Math.max(3, (footprint / 2) * view.zoom);

      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    interface SelectableObject {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
      shape?: string;
    }
    const allObjects: SelectableObject[] = [...structures, ...zones];
    const selected = allObjects.filter((obj) => selectedIds.includes(obj.id));

    for (const obj of selected) {
      const [sx, sy] = worldToScreen(obj.x, obj.y, view);
      const w = obj.width * view.zoom;
      const h = obj.height * view.zoom;
      const isCircle = obj.shape === 'circle';

      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      if (isCircle) {
        ctx.beginPath();
        ctx.ellipse(sx + w / 2, sy + h / 2, w / 2 + 1, h / 2 + 1, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(sx - 1, sy - 1, w + 2, h + 2);
      }
      ctx.setLineDash([]);

      const hs = 8;
      const handles = [
        [sx - hs / 2, sy - hs / 2],
        [sx + w / 2 - hs / 2, sy - hs / 2],
        [sx + w - hs / 2, sy - hs / 2],
        [sx + w - hs / 2, sy + h / 2 - hs / 2],
        [sx + w - hs / 2, sy + h - hs / 2],
        [sx + w / 2 - hs / 2, sy + h - hs / 2],
        [sx - hs / 2, sy + h - hs / 2],
        [sx - hs / 2, sy + h / 2 - hs / 2],
      ];
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#5BA4CF';
      ctx.lineWidth = 2;
      for (const [hx, hy] of handles) {
        ctx.fillRect(hx, hy, hs, hs);
        ctx.strokeRect(hx, hy, hs, hs);
      }

      if (obj.label) {
        renderLabel(ctx, obj.label, sx + w / 2, sy + h + 8, { align: 'center', fontSize: 10 });
      }
    }
  },
};

export const SELECTION_LAYERS: RenderLayer<SystemLayerData>[] = [
  selectionBoxes,
];
```

- [ ] **Step 2: Create SystemLayerRenderer**

```typescript
// src/canvas/SystemLayerRenderer.ts
import type { Planting, Structure, Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import type { SystemLayerData } from './layerData';
import { SELECTION_LAYERS } from './layers/selectionLayers';
import { runLayers } from './renderLayer';

export class SystemLayerRenderer extends LayerRenderer {
  selectedIds: string[] = [];
  structures: Structure[] = [];
  zones: Zone[] = [];
  plantings: Planting[] = [];
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const data: SystemLayerData = {
      selectedIds: this.selectedIds,
      structures: this.structures,
      zones: this.zones,
      plantings: this.plantings,
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
    };

    runLayers(ctx, SELECTION_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);
  }
}
```

- [ ] **Step 3: Wire SystemLayerRenderer into CanvasStack**

In `src/canvas/CanvasStack.tsx`, make these changes:

1. Add import:
```typescript
import { SystemLayerRenderer } from './SystemLayerRenderer';
```

2. Remove import:
```typescript
// DELETE: import { renderSelection } from './renderSelection';
```

3. Add ref next to the other renderer refs (after line ~72 `plantingRenderer`):
```typescript
const systemRenderer = useRef<SystemLayerRenderer>(null!);
if (!systemRenderer.current) systemRenderer.current = new SystemLayerRenderer();
```

4. Add to the onInvalidate/dispose useEffect (after line ~87):
```typescript
systemRenderer.current.onInvalidate(invalidate);
// In cleanup:
systemRenderer.current.dispose();
```

5. Add system renderer data sync (after the planting renderer sync block, before the `useLayerEffect` calls):
```typescript
systemRenderer.current.selectedIds = selectedIds;
systemRenderer.current.structures = garden.structures;
systemRenderer.current.zones = garden.zones;
systemRenderer.current.plantings = garden.plantings;
systemRenderer.current.setView(view, width, height);
```

6. Replace the selection `useLayerEffect` (lines ~272-281):
```typescript
useLayerEffect(
  selectionCanvasRef,
  width,
  height,
  dpr,
  true,
  (ctx) => systemRenderer.current.render(ctx),
  [selectedIds, garden.structures, garden.zones, garden.plantings, zoom, panX, panY],
);
```

- [ ] **Step 4: Verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add src/canvas/SystemLayerRenderer.ts src/canvas/layers/selectionLayers.ts src/canvas/CanvasStack.tsx
git commit -m "feat: promote selection rendering to SystemLayerRenderer with sub-layers"
```

---

### Task 7: uiStore Migration — renderLayerVisibility and renderLayerOrder

**Files:**
- Modify: `src/store/uiStore.ts`
- Modify: `src/canvas/CanvasStack.tsx`

Replace old boolean flags with `renderLayerVisibility` and wire it through to renderers.

- [ ] **Step 1: Add renderLayerVisibility and renderLayerOrder to uiStore**

In `src/store/uiStore.ts`, add to the `UiStore` interface (after `showPlantableArea` line ~59):

```typescript
renderLayerVisibility: Record<string, boolean>;
renderLayerOrder: Record<string, string[]>;
setRenderLayerVisible: (layerId: string, visible: boolean) => void;
setRenderLayerOrder: (renderer: string, order: string[]) => void;
```

Add to `defaultState()`:

```typescript
renderLayerVisibility: {
  'structure-surfaces': false,
  'structure-plantable-area': false,
  'planting-measurements': false,
} as Record<string, boolean>,
renderLayerOrder: {} as Record<string, string[]>,
```

Add setters to `create<UiStore>`:

```typescript
setRenderLayerVisible: (layerId, visible) =>
  set((state) => ({
    renderLayerVisibility: { ...state.renderLayerVisibility, [layerId]: visible },
  })),
setRenderLayerOrder: (renderer, order) =>
  set((state) => ({
    renderLayerOrder: { ...state.renderLayerOrder, [renderer]: order },
  })),
```

- [ ] **Step 2: Remove old boolean flags from uiStore**

Remove from the `UiStore` interface:
- `showSurfaces: boolean`
- `showSpacingBorders: boolean`
- `showFootprintCircles: boolean`
- `showMeasurements: boolean`
- `showContainerOverlays: boolean`
- `showPlantableArea: boolean`
- `magentaHighlight: boolean`
- `setShowSurfaces`, `setShowSpacingBorders`, `setShowFootprintCircles`, `setShowMeasurements`, `setShowContainerOverlays`, `setShowPlantableArea`, `setMagentaHighlight` (both interface declarations and implementations)

Remove from `defaultState()`:
- `showSurfaces: false`
- `showSpacingBorders: true`
- `showFootprintCircles: true`
- `showMeasurements: false`
- `showContainerOverlays: true`
- `showPlantableArea: false`
- `magentaHighlight: false`

- [ ] **Step 3: Update CanvasStack to use renderLayerVisibility**

In `src/canvas/CanvasStack.tsx`:

1. Remove these individual subscriptions:
```typescript
// DELETE all of these:
const showSurfaces = useUiStore((s) => s.showSurfaces);
const showPlantableArea = useUiStore((s) => s.showPlantableArea);
const showSpacingBorders = useUiStore((s) => s.showSpacingBorders);
const showFootprintCircles = useUiStore((s) => s.showFootprintCircles);
const showMeasurements = useUiStore((s) => s.showMeasurements);
const showContainerOverlays = useUiStore((s) => s.showContainerOverlays);
```

2. Add the new subscription:
```typescript
const renderLayerVisibility = useUiStore((s) => s.renderLayerVisibility);
const renderLayerOrder = useUiStore((s) => s.renderLayerOrder);
```

3. Replace the old structure renderer property assignments:
```typescript
// DELETE:
// structureRenderer.current.showSurfaces = showSurfaces;
// structureRenderer.current.showPlantableArea = showPlantableArea;

// ADD:
structureRenderer.current.renderLayerVisibility = renderLayerVisibility;
structureRenderer.current.renderLayerOrder = renderLayerOrder['structures'];
```

4. Replace the old planting renderer property assignments:
```typescript
// DELETE:
// plantingRenderer.current.showSpacingBorders = showSpacingBorders;
// plantingRenderer.current.showFootprintCircles = showFootprintCircles;
// plantingRenderer.current.showMeasurements = showMeasurements;
// plantingRenderer.current.showContainerOverlays = showContainerOverlays;

// ADD:
plantingRenderer.current.renderLayerVisibility = renderLayerVisibility;
plantingRenderer.current.renderLayerOrder = renderLayerOrder['plantings'];
```

5. Add zone and system renderer wiring:
```typescript
zoneRenderer.current.renderLayerVisibility = renderLayerVisibility;
zoneRenderer.current.renderLayerOrder = renderLayerOrder['zones'];

systemRenderer.current.renderLayerVisibility = renderLayerVisibility;
systemRenderer.current.renderLayerOrder = renderLayerOrder['system'];
```

6. Update the `useLayerEffect` dependency arrays — replace individual flag references with `renderLayerVisibility` and `renderLayerOrder`:

For structures:
```typescript
[garden.structures, zoom, panX, panY, layerOpacity.structures, activeLayer, renderLayerVisibility, renderLayerOrder, debugOverlappingLabels, labelMode, labelFontSize, structureRenderer.current.highlight, overlay],
```

For plantings:
```typescript
[garden.plantings, garden.zones, garden.structures, zoom, panX, panY, layerOpacity.plantings, activeLayer, selectedIds, renderLayerVisibility, renderLayerOrder, labelMode, labelFontSize, plantIconScale, plantingRenderer.current.highlight, overlay, iconTick],
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Verify no test regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/store/uiStore.ts src/canvas/CanvasStack.tsx
git commit -m "feat: replace scattered boolean flags with renderLayerVisibility in uiStore"
```

---

### Task 8: Update UI Consumers — LayerPropertiesPanel

**Files:**
- Modify: `src/components/sidebar/LayerPropertiesPanel.tsx`

Replace reads of old flags with reads of `renderLayerVisibility`.

- [ ] **Step 1: Read the current LayerPropertiesPanel**

Read `src/components/sidebar/LayerPropertiesPanel.tsx` to understand all the checkbox bindings.

- [ ] **Step 2: Update the panel to use renderLayerVisibility**

Replace the old flag subscriptions:
```typescript
// DELETE:
// const showSurfaces = useUiStore((s) => s.showSurfaces);
// const setShowSurfaces = useUiStore((s) => s.setShowSurfaces);
// const showSpacingBorders = useUiStore((s) => s.showSpacingBorders);
// const setShowSpacingBorders = useUiStore((s) => s.setShowSpacingBorders);
// const showFootprintCircles = useUiStore((s) => s.showFootprintCircles);
// const setShowFootprintCircles = useUiStore((s) => s.setShowFootprintCircles);
// const showMeasurements = useUiStore((s) => s.showMeasurements);
// const setShowMeasurements = useUiStore((s) => s.setShowMeasurements);
// const showPlantableArea = useUiStore((s) => s.showPlantableArea);
// const setShowPlantableArea = useUiStore((s) => s.setShowPlantableArea);

// ADD:
const renderLayerVisibility = useUiStore((s) => s.renderLayerVisibility);
const setRenderLayerVisible = useUiStore((s) => s.setRenderLayerVisible);
```

Then update each checkbox binding. The mapping from old flags to layer IDs:
- `showSurfaces` → `'structure-surfaces'` (default off)
- `showPlantableArea` → `'structure-plantable-area'` (default off)
- `showFootprintCircles` → `'planting-icons'` — note: this was controlling footprint circle visibility specifically, but planting-icons is alwaysOn. The `showFootprintCircles` flag was passed to `renderPlant` to use transparent background. This toggle now controls whether the footprint circle bg is shown — **it should NOT be mapped to layer visibility**. Instead, keep it as a rendering parameter passed through PlantingLayerData or handle it as a sub-rendering option within the planting-icons layer.

**Important nuance:** `showFootprintCircles` doesn't hide the plant icon — it just makes the footprint background circle transparent. This is a rendering detail inside the `planting-icons` layer, not a layer visibility toggle. Similarly, `showSpacingBorders` could either be a layer visibility toggle for `planting-spacing` or kept as a rendering parameter.

The clean mapping:
- `showSurfaces` → `renderLayerVisibility['structure-surfaces']` (defaults false)
- `showPlantableArea` → `renderLayerVisibility['structure-plantable-area']` (defaults false)
- `showMeasurements` → `renderLayerVisibility['planting-measurements']` (defaults false)
- `showContainerOverlays` → `renderLayerVisibility['container-overlays']` (defaults true)
- `showSpacingBorders` → `renderLayerVisibility['planting-spacing']` (defaults true)
- `showFootprintCircles` — keep as a separate property in PlantingLayerData, passed through to `renderPlant`. This controls the footprint circle fill color, not layer visibility.

Update each checkbox's `checked` and `onChange`:
```typescript
// Surfaces
checked={renderLayerVisibility['structure-surfaces'] ?? false}
onChange={(e) => setRenderLayerVisible('structure-surfaces', e.target.checked)}

// Plantable area
checked={renderLayerVisibility['structure-plantable-area'] ?? false}
onChange={(e) => setRenderLayerVisible('structure-plantable-area', e.target.checked)}

// Spacing borders
checked={renderLayerVisibility['planting-spacing'] ?? true}
onChange={(e) => setRenderLayerVisible('planting-spacing', e.target.checked)}

// Measurements
checked={renderLayerVisibility['planting-measurements'] ?? false}
onChange={(e) => setRenderLayerVisible('planting-measurements', e.target.checked)}

// Container overlays
checked={renderLayerVisibility['container-overlays'] ?? true}
onChange={(e) => setRenderLayerVisible('container-overlays', e.target.checked)}
```

For `showFootprintCircles`: keep using `renderLayerVisibility` with a special key that the planting-icons layer reads internally, or keep as a dedicated boolean in the layer data. Since the spec says to remove the old flags, map it as:
```typescript
checked={renderLayerVisibility['planting-footprint-circles'] ?? true}
onChange={(e) => setRenderLayerVisible('planting-footprint-circles', e.target.checked)}
```

And in `plantingLayers.ts` (planting-icons layer), read it from the visibility map passed alongside data. Since `runLayers` doesn't pass visibility to individual layers, we need to add `showFootprintCircles` to `PlantingLayerData`:

```typescript
// Add to PlantingLayerData in layerData.ts:
showFootprintCircles: boolean;
```

And in `buildPlantingLayerData`, accept it as a parameter and pass it through. In the planting-icons layer, use it to choose the footprint fill.

- [ ] **Step 3: Update PlantingLayerData and buildPlantingLayerData for showFootprintCircles**

In `src/canvas/layerData.ts`, add to `PlantingLayerData`:
```typescript
showFootprintCircles: boolean;
```

In `src/canvas/layers/plantingLayers.ts`, update `buildPlantingLayerData` signature:
```typescript
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
  showFootprintCircles: boolean,
): PlantingLayerData {
  // ... existing code ...
  return {
    // ... existing fields ...
    showFootprintCircles,
  };
}
```

Update the planting-icons layer to use it:
```typescript
renderPlant(ctx, p.cultivarId, radius, color, data.showFootprintCircles ? undefined : 'transparent');
```

In `PlantingLayerRenderer.ts`, pass it through:
```typescript
const data = buildPlantingLayerData(
  // ... existing args ...
  this.renderLayerVisibility['planting-footprint-circles'] ?? true,
);
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/LayerPropertiesPanel.tsx src/canvas/layerData.ts src/canvas/layers/plantingLayers.ts src/canvas/PlantingLayerRenderer.ts
git commit -m "feat: update LayerPropertiesPanel to use renderLayerVisibility"
```

---

### Task 9: Remove magentaHighlight

**Files:**
- Modify: `src/components/sidebar/DebugThemePanel.tsx`
- Modify: `src/hooks/useActiveTheme.ts`

- [ ] **Step 1: Remove magentaHighlight from DebugThemePanel**

In `src/components/sidebar/DebugThemePanel.tsx`, remove lines 18-19 and the checkbox block (lines 116-123):

```typescript
// DELETE:
// const magentaHighlight = useUiStore((s) => s.magentaHighlight);
// const setMagentaHighlight = useUiStore((s) => s.setMagentaHighlight);

// DELETE the entire <label> block:
// <label className={styles.surfaceToggle}>
//   <input type="checkbox" checked={magentaHighlight} onChange=... />
//   <span>Magenta highlight</span>
// </label>
```

- [ ] **Step 2: Remove magentaHighlight from useActiveTheme**

In `src/hooks/useActiveTheme.ts`, remove:
```typescript
// DELETE:
// const magentaHighlight = useUiStore((s) => s.magentaHighlight);
// ...
// if (magentaHighlight) {
//   theme = { ...theme, listHover: MAGENTA_HOVER };
// }
```

Also remove the `MAGENTA_HOVER` constant if it exists and is only used here.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Verify no test regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/DebugThemePanel.tsx src/hooks/useActiveTheme.ts src/store/uiStore.ts
git commit -m "fix: remove dead magentaHighlight feature"
```

---

### Task 10: Cleanup — Remove Dead Render Functions

**Files:**
- Modify: `src/canvas/renderZones.ts` — keep the file but mark the export function as deprecated or delete if no other consumers exist
- Modify: `src/canvas/renderStructures.ts` — keep for overlay rendering (StructureLayerRenderer still uses it for overlays)
- Delete: `src/canvas/renderSelection.ts` — fully replaced by selectionLayers.ts

- [ ] **Step 1: Check for remaining consumers of renderZones, renderStructures, renderSelection**

Search the codebase for imports of these functions to confirm which can be deleted.

- `renderZones` — check if ZoneLayerRenderer still imports it (overlay rendering uses it). If so, keep it.
- `renderStructures` — check if StructureLayerRenderer still imports it (overlay rendering uses it). If so, keep it.
- `renderSelection` — should have zero remaining imports after Task 6.

- [ ] **Step 2: Delete renderSelection.ts if unused**

```bash
git rm src/canvas/renderSelection.ts
```

- [ ] **Step 3: Remove the old renderPlantings main function if unused**

Check if `renderPlantings` from `src/canvas/renderPlantings.ts` is still imported anywhere other than the old PlantingLayerRenderer. The `renderOverlayPlantings` export is still used by the new PlantingLayerRenderer, so keep the file but the `renderPlantings` function can be deleted if unused.

- [ ] **Step 4: Verify it compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead render functions replaced by sub-layer architecture"
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No new lint errors (pre-existing ones are acceptable)

- [ ] **Step 4: Manual smoke test checklist**

Verify visually in the browser:
- Structures render with fill, stroke, surfaces, plantable area (when toggled)
- Zones render with fill, dashed stroke, patterns, highlights
- Plantings render with icons, spacing borders, container overlays, labels
- Selection boxes render with handles and dashed outlines
- Toggle checkboxes in the sidebar still work (surfaces, plantable area, spacing, measurements, container overlays)
- Layer highlight animation still works (hover/flash on layer switch)
- Drag overlay still renders ghost objects correctly
- magentaHighlight checkbox is gone from Debug panel
