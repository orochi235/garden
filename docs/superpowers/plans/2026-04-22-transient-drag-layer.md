# Transient Drag Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace real-time garden state mutation during drags with a transient overlay that only commits on drop.

**Architecture:** A `dragOverlay` field in uiStore holds the objects being dragged. Renderers filter out hidden IDs and draw overlay objects on their respective canvases. `useMoveInteraction` writes to the overlay during drags and commits to the garden on drop. Palette drags switch from native drag API to pointer events using the same overlay.

**Tech Stack:** React, Zustand, Canvas 2D

---

### Task 1: Add dragOverlay to uiStore

**Files:**
- Modify: `src/store/uiStore.ts`

- [ ] **Step 1: Write the failing test**

Create `src/store/uiStore.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

describe('dragOverlay', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('starts as null', () => {
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('can be set and cleared', () => {
    const overlay = {
      layer: 'plantings' as const,
      objects: [{ id: 'p1', parentId: 's1', cultivarId: 'tomato', x: 1, y: 2, label: 'Tomato', icon: null }],
      hideIds: ['p1'],
      snapped: false,
    };
    useUiStore.getState().setDragOverlay(overlay);
    expect(useUiStore.getState().dragOverlay).toEqual(overlay);

    useUiStore.getState().clearDragOverlay();
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('is cleared on reset', () => {
    useUiStore.getState().setDragOverlay({
      layer: 'structures',
      objects: [],
      hideIds: [],
      snapped: false,
    });
    useUiStore.getState().reset();
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/uiStore.test.ts`
Expected: FAIL — `dragOverlay`, `setDragOverlay`, `clearDragOverlay` don't exist.

- [ ] **Step 3: Add DragOverlay type and store fields**

In `src/store/uiStore.ts`, add the import and type before the `UiStore` interface:

```ts
import type { Planting, Structure, Zone, LayerId } from '../model/types';

export interface DragOverlay {
  layer: 'plantings' | 'structures' | 'zones';
  objects: (Planting | Structure | Zone)[];
  hideIds: string[];
  snapped: boolean;
}
```

Add to the `UiStore` interface:

```ts
  dragOverlay: DragOverlay | null;
  setDragOverlay: (overlay: DragOverlay) => void;
  clearDragOverlay: () => void;
```

Add to the store implementation:

```ts
  dragOverlay: null,
  setDragOverlay: (overlay) => set({ dragOverlay: overlay }),
  clearDragOverlay: () => set({ dragOverlay: null }),
```

Add `dragOverlay: null,` to the `reset()` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/uiStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat: add dragOverlay state to uiStore"
```

---

### Task 2: Add hideIds filtering to layer renderers

**Files:**
- Modify: `src/canvas/PlantingLayerRenderer.ts`
- Modify: `src/canvas/StructureLayerRenderer.ts`
- Modify: `src/canvas/ZoneLayerRenderer.ts`

- [ ] **Step 1: Add hideIds to PlantingLayerRenderer**

In `src/canvas/PlantingLayerRenderer.ts`, add a `hideIds` field and filter before rendering:

```ts
export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  showSpacing: boolean = false;
  ghost: GhostPlanting | null = null;
  hideIds: string[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;
    renderPlantings(
      ctx,
      visiblePlantings,
      this.zones,
      this.structures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.selectedIds,
      this.showSpacing,
      this.ghost,
    );
  }
}
```

- [ ] **Step 2: Add hideIds to StructureLayerRenderer**

In `src/canvas/StructureLayerRenderer.ts`:

```ts
export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  showSurfaces = false;
  hideIds: string[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;
    renderStructures(
      ctx,
      visibleStructures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.showSurfaces,
    );
  }
}
```

- [ ] **Step 3: Add hideIds to ZoneLayerRenderer**

In `src/canvas/ZoneLayerRenderer.ts`:

```ts
export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];
  hideIds: string[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleZones = this.hideIds.length > 0
      ? this.zones.filter((z) => !this.hideIds.includes(z.id))
      : this.zones;
    renderZones(
      ctx,
      visibleZones,
      this.view,
      this.width,
      this.height,
      this.highlight,
    );
  }
}
```

- [ ] **Step 4: Wire hideIds in CanvasStack**

In `src/canvas/CanvasStack.tsx`, after the existing renderer property assignments (around line 245), add overlay-driven hideIds. Find the block where renderer properties are set and add:

```ts
  const overlay = useUiStore.getState().dragOverlay;
  plantingRenderer.current.hideIds = overlay?.layer === 'plantings' ? overlay.hideIds : [];
  structureRenderer.current.hideIds = overlay?.layer === 'structures' ? overlay.hideIds : [];
  zoneRenderer.current.hideIds = overlay?.layer === 'zones' ? overlay.hideIds : [];
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/PlantingLayerRenderer.ts src/canvas/StructureLayerRenderer.ts src/canvas/ZoneLayerRenderer.ts src/canvas/CanvasStack.tsx
git commit -m "feat: add hideIds filtering to layer renderers"
```

---

### Task 3: Add overlay rendering to layer renderers

**Files:**
- Modify: `src/canvas/PlantingLayerRenderer.ts`
- Modify: `src/canvas/StructureLayerRenderer.ts`
- Modify: `src/canvas/ZoneLayerRenderer.ts`
- Modify: `src/canvas/renderPlantings.ts`

The overlay objects are drawn on the same canvas as their layer, after normal rendering. When `snapped` is true, they render ghosted (reduced opacity, dashed outline). When false, they render at full opacity.

- [ ] **Step 1: Add overlay rendering to PlantingLayerRenderer**

Add an `overlayPlantings` field and `overlaySnapped` field:

```ts
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;
```

In the `draw` method, after the `renderPlantings` call, render overlay plantings. Reuse the same `renderPlantings` function but without clearing the canvas (the existing function calls `ctx.clearRect` at the top, so we need a separate render path for overlay).

Add a new export to `src/canvas/renderPlantings.ts`:

```ts
export function renderOverlayPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  structures: Structure[],
  view: ViewTransform,
  snapped: boolean,
): void {
  if (plantings.length === 0) return;

  const parentMap = new Map<string, PlantingParent>();
  for (const zone of zones) {
    parentMap.set(zone.id, zone);
  }
  for (const s of structures) {
    if (s.container) parentMap.set(s.id, s);
  }

  ctx.save();
  if (snapped) {
    ctx.globalAlpha = 0.4;
  }

  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);
    const color = cultivar?.color ?? '#4A7C59';
    const footprint = cultivar?.footprintFt ?? 0.5;

    const isSingleFill = parent.arrangement?.type === 'single';
    const worldX = parent.x + p.x;
    const worldY = parent.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);
    const radius = isSingleFill
      ? Math.max(3, (Math.min(parent.width, parent.height) / 2) * view.zoom)
      : Math.max(3, (footprint / 2) * view.zoom);
    const shape = isSingleFill && parent.shape === 'circle' ? 'circle' as const : 'square' as const;

    ctx.save();
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

  ctx.restore();
}
```

Then in `PlantingLayerRenderer.draw`, after the existing `renderPlantings` call:

```ts
    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(
        ctx,
        this.overlayPlantings,
        this.zones,
        this.structures,
        this.view,
        this.overlaySnapped,
      );
    }
```

- [ ] **Step 2: Add overlay rendering to StructureLayerRenderer**

Add fields and render overlay structures after normal rendering. The `renderStructures` function calls `clearRect`, so render overlay structures inline:

```ts
  overlayStructures: Structure[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;
    renderStructures(ctx, visibleStructures, this.view, this.width, this.height, this.highlight, this.showSurfaces);

    if (this.overlayStructures.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderStructures(ctx, this.overlayStructures, this.view, this.width, this.height, 0, this.showSurfaces);
      ctx.restore();
    }
  }
```

Note: `renderStructures` calls `clearRect` at the top. We need to skip that for overlay rendering. Add an optional `skipClear` parameter to `renderStructures`:

In `src/canvas/renderStructures.ts`, change the signature:

```ts
export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number = 0,
  showSurfaces: boolean = false,
  skipClear: boolean = false,
): void {
  if (!skipClear) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
```

Then the overlay call passes `true` for `skipClear`:

```ts
      renderStructures(ctx, this.overlayStructures, this.view, this.width, this.height, 0, this.showSurfaces, true);
```

- [ ] **Step 3: Add overlay rendering to ZoneLayerRenderer**

Same pattern. Add `skipClear` parameter to `renderZones` in `src/canvas/renderZones.ts`:

```ts
export function renderZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  highlightOpacity: number = 0,
  skipClear: boolean = false,
): void {
  if (!skipClear) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
```

In `ZoneLayerRenderer`:

```ts
  overlayZones: Zone[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleZones = this.hideIds.length > 0
      ? this.zones.filter((z) => !this.hideIds.includes(z.id))
      : this.zones;
    renderZones(ctx, visibleZones, this.view, this.width, this.height, this.highlight);

    if (this.overlayZones.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderZones(ctx, this.overlayZones, this.view, this.width, this.height, 0, true);
      ctx.restore();
    }
  }
```

- [ ] **Step 4: Wire overlay data in CanvasStack**

In `src/canvas/CanvasStack.tsx`, after the hideIds wiring added in Task 2, feed overlay objects to the renderers:

```ts
  if (overlay?.layer === 'plantings') {
    plantingRenderer.current.overlayPlantings = overlay.objects as Planting[];
    plantingRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    plantingRenderer.current.overlayPlantings = [];
    plantingRenderer.current.overlaySnapped = false;
  }
  if (overlay?.layer === 'structures') {
    structureRenderer.current.overlayStructures = overlay.objects as Structure[];
    structureRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    structureRenderer.current.overlayStructures = [];
    structureRenderer.current.overlaySnapped = false;
  }
  if (overlay?.layer === 'zones') {
    zoneRenderer.current.overlayZones = overlay.objects as Zone[];
    zoneRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    zoneRenderer.current.overlayZones = [];
    zoneRenderer.current.overlaySnapped = false;
  }
```

Add `overlay` to the `useLayerEffect` dependency arrays for each layer so they re-render when the overlay changes.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/PlantingLayerRenderer.ts src/canvas/StructureLayerRenderer.ts src/canvas/ZoneLayerRenderer.ts src/canvas/renderPlantings.ts src/canvas/renderStructures.ts src/canvas/renderZones.ts src/canvas/CanvasStack.tsx
git commit -m "feat: add overlay rendering to layer renderers"
```

---

### Task 4: Rewrite useMoveInteraction to use dragOverlay

This is the core task. Replace all garden mutations during drag with overlay updates.

**Files:**
- Modify: `src/canvas/hooks/useMoveInteraction.ts`
- Modify: `src/canvas/hooks/useMoveInteraction.test.ts`

- [ ] **Step 1: Update tests for overlay-based behavior**

The existing tests assert that garden state changes during `move()`. With the overlay approach, garden state should NOT change during `move()` — only on `end()`. Rewrite the test file:

```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { useMoveInteraction } from './useMoveInteraction';

function createContainerRef(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const el = {
    getBoundingClientRect: () => rect,
  } as HTMLDivElement;
  return { current: el };
}

function mouseEvent(clientX: number, clientY: number, altKey = false): React.MouseEvent {
  return { clientX, clientY, altKey } as React.MouseEvent;
}

describe('useMoveInteraction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('does not mutate garden during move — updates overlay instead', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));

    // Garden unchanged during drag
    const gardenPatio = useGardenStore.getState().garden.structures[0];
    expect(gardenPatio.x).toBe(5);
    expect(gardenPatio.y).toBe(5);

    // Overlay has the updated position
    const overlay = useUiStore.getState().dragOverlay;
    expect(overlay).not.toBeNull();
    expect(overlay!.hideIds).toContain(patio.id);
    expect(overlay!.objects[0].x).toBe(11);
  });

  it('commits overlay to garden on end', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.end();

    const updated = useGardenStore.getState().garden.structures[0];
    expect(updated.x).toBe(11);
    expect(updated.y).toBe(10);

    // Overlay cleared
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('moves child structures in overlay along with parent', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 10, height: 10 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 6, y: 6, width: 1, height: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().updateStructure(pot.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(11, 11));

    const overlay = useUiStore.getState().dragOverlay!;
    expect(overlay.objects).toHaveLength(2);
    expect(overlay.hideIds).toContain(patio.id);
    expect(overlay.hideIds).toContain(pot.id);

    // Commit and check final positions
    result.current.end();
    const structures = useGardenStore.getState().garden.structures;
    expect(structures.find((s) => s.id === patio.id)!.x).toBe(10);
    expect(structures.find((s) => s.id === pot.id)!.x).toBe(11);
  });

  it('does not start drag below threshold', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(7, 7));
    result.current.end();

    expect(useUiStore.getState().dragOverlay).toBeNull();
    expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
  });

  it('cancel clears overlay without committing', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.cancel();

    expect(useUiStore.getState().dragOverlay).toBeNull();
    expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
  });

  it('creates exactly one undo entry on commit', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.end();

    expect(useGardenStore.getState().garden.structures[0].x).toBe(11);

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/canvas/hooks/useMoveInteraction.test.ts`
Expected: Most tests FAIL (garden still mutated during move, no overlay, no cancel method).

- [ ] **Step 3: Rewrite useMoveInteraction**

Replace the contents of `src/canvas/hooks/useMoveInteraction.ts`. The key changes:

- `activateDrag()`: Sets `dragOverlay` via `useUiStore.getState().setDragOverlay()` instead of calling `checkpoint()` or `addPlanting()`. For moves, snapshots the object (plus children for structures) and sets `hideIds`. For clones (when `cloneData` is present), creates a transient object via `createPlanting` (no garden mutation) with `hideIds: []`.
- `move()`: Updates `dragOverlay` via `useUiStore.getState().setDragOverlay()` with new object positions. No garden store calls.
- `end()`: Calls `checkpoint()`, then applies the overlay to the garden (via `updateStructure`/`updateZone`/`updatePlanting`/`addPlanting`), then calls `clearDragOverlay()`.
- `cancel()`: New method. Calls `clearDragOverlay()`. No undo needed.
- Remove refs: `pendingClone`, `isClone`, `originalPlantingPos`, `isAtOriginalPos`, `childStartPositions`.
- Keep refs: `isPending`, `isMoving`, `moveStart`, `screenStart`, `moveObjectId`, `moveObjectLayer`, `forceSnap`, `dwellTimer`, `dwellContainerId`, `putativeSnap`.
- `putativeSnap` updates now write to `dragOverlay.snapped` and update the overlay object position to the snap slot, rather than being a separate rendering path.

The full implementation is too long to inline verbatim here. The engineer should follow this structure:

**`activateDrag()`:**
```ts
function activateDrag() {
  isPending.current = false;
  isMoving.current = true;

  const { garden } = useGardenStore.getState();
  const layer = moveObjectLayer.current!;
  const id = moveObjectId.current!;

  if (cloneData.current) {
    // Clone: create transient object, don't touch garden
    const clone = cloneData.current;
    if (layer === 'plantings') {
      const transient = createPlanting({
        parentId: clone.parentId,
        x: clone.x,
        y: clone.y,
        cultivarId: clone.cultivarId,
      });
      moveObjectId.current = transient.id;
      useUiStore.getState().setDragOverlay({
        layer: 'plantings',
        objects: [transient],
        hideIds: [],
        snapped: false,
      });
    }
    cloneData.current = null;
  } else {
    // Move: snapshot from garden
    if (layer === 'structures') {
      const obj = garden.structures.find((s) => s.id === id)!;
      const children = garden.structures.filter((s) => s.parentId === id);
      const allObjects = [{ ...obj }, ...children.map((c) => ({ ...c }))];
      const hideIds = allObjects.map((o) => o.id);
      useUiStore.getState().setDragOverlay({
        layer: 'structures',
        objects: allObjects,
        hideIds,
        snapped: false,
      });
    } else if (layer === 'zones') {
      const obj = garden.zones.find((z) => z.id === id)!;
      useUiStore.getState().setDragOverlay({
        layer: 'zones',
        objects: [{ ...obj }],
        hideIds: [id],
        snapped: false,
      });
    } else if (layer === 'plantings') {
      const obj = garden.plantings.find((p) => p.id === id)!;
      useUiStore.getState().setDragOverlay({
        layer: 'plantings',
        objects: [{ ...obj }],
        hideIds: [id],
        snapped: false,
      });
    }
  }
}
```

**`move()`** — update overlay positions instead of garden:
```ts
// For structures:
const overlay = useUiStore.getState().dragOverlay!;
const primary = overlay.objects[0] as Structure;
const moved = { ...primary, x: snappedX, y: snappedY };
// Collision check against garden structures (excluding hideIds)
const others = garden.structures.filter((s) => !overlay.hideIds.includes(s.id));
if (!structuresCollide(moved, others)) {
  const dx = snappedX - moveStart.current.objX;
  const dy = snappedY - moveStart.current.objY;
  const updatedObjects = overlay.objects.map((obj, i) => {
    if (i === 0) return moved;
    return { ...obj, x: (obj as Structure).x + dx - prevDx, y: (obj as Structure).y + dy - prevDy };
  });
  useUiStore.getState().setDragOverlay({ ...overlay, objects: updatedObjects });
}
```

For child structure delta tracking, store the initial child offsets relative to the primary object at `activateDrag` time (in a ref `childOffsets`), then apply `primary.x + offset` each move.

**`end()`:**
```ts
function end(e?: React.MouseEvent) {
  if (isPending.current) {
    isPending.current = false;
    cloneData.current = null;
    moveObjectId.current = null;
    moveObjectLayer.current = null;
    return;
  }

  const overlay = useUiStore.getState().dragOverlay;
  if (!overlay) {
    cleanup();
    return;
  }

  const { checkpoint, updateStructure, updateZone, updatePlanting, addPlanting } = useGardenStore.getState();

  // Handle snap commit
  if (overlay.layer === 'plantings' && putativeSnap.current) {
    const snap = putativeSnap.current;
    const planting = overlay.objects[0] as Planting;
    if (overlay.hideIds.length > 0) {
      // Move: re-parent
      checkpoint();
      updatePlanting(overlay.hideIds[0], {
        parentId: snap.containerId,
        x: snap.slotX,
        y: snap.slotY,
      });
    } else {
      // Clone/palette: add new
      addPlanting({
        parentId: snap.containerId,
        x: snap.slotX,
        y: snap.slotY,
        cultivarId: planting.cultivarId,
      });
    }
  } else {
    // Normal commit
    checkpoint();
    if (overlay.layer === 'structures') {
      for (const obj of overlay.objects) {
        const s = obj as Structure;
        if (overlay.hideIds.includes(s.id)) {
          updateStructure(s.id, { x: s.x, y: s.y });
        }
      }
    } else if (overlay.layer === 'zones') {
      const z = overlay.objects[0] as Zone;
      updateZone(z.id, { x: z.x, y: z.y });
    } else if (overlay.layer === 'plantings') {
      const p = overlay.objects[0] as Planting;
      if (overlay.hideIds.length > 0) {
        updatePlanting(p.id, { x: p.x, y: p.y });
      } else {
        // Clone/palette drop
        addPlanting({
          parentId: p.parentId,
          x: p.x,
          y: p.y,
          cultivarId: p.cultivarId,
        });
      }
    }
  }

  useUiStore.getState().clearDragOverlay();
  cleanup();
}

function cancel() {
  useUiStore.getState().clearDragOverlay();
  cleanup();
}

function cleanup() {
  clearSnap();
  isMoving.current = false;
  moveObjectId.current = null;
  moveObjectLayer.current = null;
  cloneData.current = null;
}
```

Return `cancel` from the hook: `return { start, move, end, cancel, isMoving, putativeSnap };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/canvas/hooks/useMoveInteraction.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/hooks/useMoveInteraction.ts src/canvas/hooks/useMoveInteraction.test.ts
git commit -m "feat: rewrite useMoveInteraction to use dragOverlay"
```

---

### Task 5: Update CanvasStack pointer handlers for overlay-based drags

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Update pointer down handler**

In the `handlePointerDown` callback, simplify the alt-clone path. Instead of creating the clone or storing `pendingClone`, pass `cloneData` to `moveInteraction.start()`:

For plantings alt-clone (around line 367-381):
```ts
if (hit.layer === 'plantings') {
  const planting = garden.plantings.find((p) => p.id === hit.id);
  if (planting) {
    const parent = garden.structures.find((s) => s.id === planting.parentId)
      ?? garden.zones.find((z) => z.id === planting.parentId);
    if (parent) {
      select(hit.id);
      moveInteraction.start(worldX, worldY, hit.id, hit.layer, parent.x + planting.x, parent.y + planting.y, false, {
        parentId: planting.parentId,
        x: planting.x,
        y: planting.y,
        cultivarId: planting.cultivarId,
      });
      setActiveCursor('copy');
    }
  }
}
```

This is already mostly correct from the earlier fix. The key difference is that `moveInteraction.start` now stores `cloneData` in a ref, and `activateDrag` creates the transient clone in the overlay instead of calling `addPlanting`.

- [ ] **Step 2: Remove ghost planting wiring**

Remove the `snapState` / `ghost` wiring block (around line 244-256) that feeds `plantingRenderer.current.ghost`. The overlay rendering replaces this. Specifically remove:

```ts
const snapState = moveInteraction.putativeSnap.current;
// ... the ghost assignment block
```

And remove `ghost` from the `useLayerEffect` dependency array for plantings.

- [ ] **Step 3: Update snap-back handling**

In the pointer up handler, the snap-back case (planting returned to original position) previously called `undo()`. Now it just calls `moveInteraction.cancel()`:

Find the `handlePointerUp` and update it. The `end()` function in useMoveInteraction handles this internally — if the overlay position matches the original position, `cancel()` is called instead of committing. Actually, snap-back detection moves into `useMoveInteraction.move()`: when the cursor returns near the start position, the overlay objects are reset to their original positions. On `end()`, if positions match the garden, the overlay is simply cleared with no commit.

- [ ] **Step 4: Build and manually test**

Run: `npm run build`
Expected: No type errors.

Manually test:
1. Drag a structure — should move smoothly, undo in one step
2. Alt-drag a planting — should clone, source container keeps rendering, undo in one step
3. Drag a planting near a container — should show snap preview, drop commits
4. Drag and release at start position — no history entry

- [ ] **Step 5: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "feat: update CanvasStack pointer handlers for overlay-based drags"
```

---

### Task 6: Remove GhostPlanting rendering path

**Files:**
- Modify: `src/canvas/renderPlantings.ts`
- Modify: `src/canvas/PlantingLayerRenderer.ts`

- [ ] **Step 1: Remove GhostPlanting interface and rendering**

In `src/canvas/renderPlantings.ts`:
- Remove the `GhostPlanting` export interface
- Remove the `ghost` parameter from `renderPlantings`
- Remove the ghost rendering block (the `if (ghost)` section around lines 157-199)

- [ ] **Step 2: Remove ghost field from PlantingLayerRenderer**

In `src/canvas/PlantingLayerRenderer.ts`:
- Remove the `ghost` field
- Remove the `ghost` import (`type GhostPlanting`)
- Remove `this.ghost` from the `renderPlantings` call

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No type errors. If there are references to `GhostPlanting` elsewhere, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/renderPlantings.ts src/canvas/PlantingLayerRenderer.ts
git commit -m "refactor: remove GhostPlanting rendering path (replaced by overlay)"
```

---

### Task 7: Convert palette drag to pointer events

**Files:**
- Modify: `src/components/palette/PaletteItem.tsx`
- Modify: `src/components/palette/ObjectPalette.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Replace draggable with onPointerDown in PaletteItem**

In `src/components/palette/PaletteItem.tsx`, change the `PaletteItem`, `PlantingLeafRow`, and `PlantingChildRow` components:

Replace the `onDragStart` / `onDragEnd` props with a single `onDragBegin` prop that takes `(entry: PaletteEntry, e: React.PointerEvent) => void`.

For each component:
- Remove `draggable` attribute
- Remove `onDragStart` and `onDragEnd` handlers
- Add `onPointerDown={(e) => onDragBegin(entry, e)}` (only on primary button: check `e.button === 0`)

```ts
interface Props {
  entry: PaletteEntry;
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}

// In the JSX:
<div
  className={`${styles.item} ${isActive ? styles.active : ''}`}
  onPointerDown={(e) => {
    if (e.button === 0) onDragBegin(entry, e);
  }}
  onClick={handleClick}
>
```

Do the same for `PlantingLeafRow` and `PlantingChildRow` — update their `Props`/`LeafRowProps`/`ChildRowProps` interfaces and JSX.

- [ ] **Step 2: Update ObjectPalette to pass onDragBegin**

In `src/components/palette/ObjectPalette.tsx`, update the props interface and pass-through:

```ts
interface ObjectPaletteProps {
  onDragBegin: (entry: PaletteEntry, e: React.PointerEvent) => void;
}
```

Remove `onDragEnd` prop. Pass `onDragBegin` through to `PaletteItem`, `PlantingLeafRow`, and `PlantingChildRow`.

- [ ] **Step 3: Extract getPlantingPosition**

The `getPlantingPosition` function is currently defined locally in `src/canvas/CanvasStack.tsx` (around line 35). Move it to `src/utils/planting.ts` and export it, since it's now also needed in `App.tsx`. Update the import in `CanvasStack.tsx`.

- [ ] **Step 4: Implement palette drag in App**

In `src/components/App.tsx`:

Remove:
- `draggingEntry` state
- `handlePaletteDragStart` function
- `draggingEntry` and `onDragEnd` props passed to `CanvasStack`

Add a `handlePaletteDragBegin` function that captures the pointer and starts tracking mouse movement. When the cursor moves past a threshold (or enters the canvas area), it creates a transient object in the overlay:

```ts
function handlePaletteDragBegin(entry: PaletteEntry, e: React.PointerEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let dragStarted = false;

  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);

  function onMove(me: PointerEvent) {
    const dx = me.clientX - startX;
    const dy = me.clientY - startY;

    if (!dragStarted && dx * dx + dy * dy >= 16) {
      dragStarted = true;
      // Create transient object in overlay
      const canvasEl = document.querySelector('[data-canvas-container]');
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(me.clientX - rect.left, me.clientY - rect.top, { panX, panY, zoom });
      const cellSize = useGardenStore.getState().garden.gridCellSizeFt;

      if (entry.category === 'plantings') {
        const transient = createPlanting({
          parentId: '',  // No parent yet
          x: worldX,
          y: worldY,
          cultivarId: entry.id,
        });
        useUiStore.getState().setDragOverlay({
          layer: 'plantings',
          objects: [transient],
          hideIds: [],
          snapped: false,
        });
      } else if (entry.category === 'structures') {
        const transient = createStructure({
          type: entry.type,
          x: snapToGrid(worldX - entry.defaultWidth / 2, cellSize),
          y: snapToGrid(worldY - entry.defaultHeight / 2, cellSize),
          width: entry.defaultWidth,
          height: entry.defaultHeight,
        });
        useUiStore.getState().setDragOverlay({
          layer: 'structures',
          objects: [transient],
          hideIds: [],
          snapped: false,
        });
      } else if (entry.category === 'zones') {
        const transient = createZone({
          x: snapToGrid(worldX - entry.defaultWidth / 2, cellSize),
          y: snapToGrid(worldY - entry.defaultHeight / 2, cellSize),
          width: entry.defaultWidth,
          height: entry.defaultHeight,
        });
        useUiStore.getState().setDragOverlay({
          layer: 'zones',
          objects: [transient],
          hideIds: [],
          snapped: false,
        });
      }
    }

    if (dragStarted) {
      // Update overlay position
      const canvasEl = document.querySelector('[data-canvas-container]');
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(me.clientX - rect.left, me.clientY - rect.top, { panX, panY, zoom });
      const cellSize = useGardenStore.getState().garden.gridCellSizeFt;
      const overlay = useUiStore.getState().dragOverlay;
      if (overlay) {
        const obj = overlay.objects[0];
        if (overlay.layer === 'plantings') {
          useUiStore.getState().setDragOverlay({
            ...overlay,
            objects: [{ ...obj, x: worldX, y: worldY }],
          });
        } else {
          const w = 'width' in obj ? (obj as Structure).width : 0;
          const h = 'height' in obj ? (obj as Structure).height : 0;
          useUiStore.getState().setDragOverlay({
            ...overlay,
            objects: [{ ...obj, x: snapToGrid(worldX - w / 2, cellSize), y: snapToGrid(worldY - h / 2, cellSize) }],
          });
        }
      }
    }
  }

  function onUp(ue: PointerEvent) {
    target.releasePointerCapture(ue.pointerId);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);

    if (!dragStarted) return;

    const overlay = useUiStore.getState().dragOverlay;
    if (!overlay) return;

    // Commit to garden
    const { addStructure, addZone, addPlanting, garden } = useGardenStore.getState();
    const obj = overlay.objects[0];

    if (overlay.layer === 'structures') {
      addStructure({
        type: (obj as Structure).type,
        x: (obj as Structure).x,
        y: (obj as Structure).y,
        width: (obj as Structure).width,
        height: (obj as Structure).height,
      });
    } else if (overlay.layer === 'zones') {
      addZone({
        x: (obj as Zone).x,
        y: (obj as Zone).y,
        width: (obj as Zone).width,
        height: (obj as Zone).height,
      });
    } else if (overlay.layer === 'plantings') {
      const p = obj as Planting;
      // Find container under drop point
      const worldX = p.x;
      const worldY = p.y;
      const container = garden.structures.find(
        (s) => s.container && worldX >= s.x && worldX <= s.x + s.width && worldY >= s.y && worldY <= s.y + s.height,
      );
      const zone = garden.zones.find(
        (z) => worldX >= z.x && worldX <= z.x + z.width && worldY >= z.y && worldY <= z.y + z.height,
      );
      const parent = container ?? zone;
      if (parent) {
        const pos = getPlantingPosition(parent, garden.plantings.filter(pl => pl.parentId === parent.id), worldX, worldY, garden.gridCellSizeFt);
        addPlanting({
          parentId: parent.id,
          x: pos.x,
          y: pos.y,
          cultivarId: p.cultivarId,
        });
      }
      // If no valid parent, just clear (no-op drop)
    }

    useUiStore.getState().clearDragOverlay();
  }

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
}
```

Pass `handlePaletteDragBegin` as `onDragBegin` prop to `ObjectPalette`.

- [ ] **Step 5: Remove native drag handling from CanvasStack**

In `src/canvas/CanvasStack.tsx`:
- Remove `handleDragOver`, `handleDragLeave`, `handleDrop` callbacks
- Remove `dragGhost` state and `ghostStyle` memo
- Remove `draggingEntry` and `onDragEnd` from the component props
- Remove `onDragOver`, `onDragLeave`, `onDrop` from the container div
- Remove the ghost `div` from the JSX (`{ghostStyle && <div style={ghostStyle} />}`)

- [ ] **Step 6: Build and manually test**

Run: `npm run build`
Expected: No type errors.

Manually test:
1. Drag a structure from palette to canvas — should show live preview, snap to grid
2. Drag a planting from palette over a container — should snap to container
3. Drag a planting from palette to empty space — no-op, no crash
4. Click palette items — still activates plotting tool (no accidental drag)

- [ ] **Step 7: Commit**

```bash
git add src/components/palette/PaletteItem.tsx src/components/palette/ObjectPalette.tsx src/components/App.tsx src/canvas/CanvasStack.tsx src/utils/planting.ts
git commit -m "feat: convert palette drag to pointer events with overlay preview"
```

---

### Task 8: Clean up and final verification

**Files:**
- Modify: `src/canvas/CanvasStack.tsx` (if needed)
- Modify: `src/canvas/hooks/useMoveInteraction.ts` (if needed)

- [ ] **Step 1: Remove unused imports and dead code**

Search for any remaining references to:
- `GhostPlanting`
- `dragGhost`
- `ghostStyle`
- `draggingEntry`
- `handlePaletteDragStart`
- `PaletteEntry` import in CanvasStack (may still be needed for `getPlantingPosition`)

Remove any that are no longer used.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean up dead code from drag overlay migration"
```
