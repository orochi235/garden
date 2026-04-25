# Plant Rendering Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign plant rendering to show footprint circles with `iconBgColor` fill and dashed spacing borders, add debug toggles, and stub overlay architecture.

**Architecture:** Replace the single-radius plant rendering with a two-layer model (footprint circle + spacing border). The renderer always clips the icon to a circle. Spacing border shape matches the parent container. Three debug toggles replace the old `showPlantingSpacing` boolean. A `PlantOverlay` type is added but not wired to any UI yet.

**Tech Stack:** Canvas 2D, Zustand, React, Vitest

---

### Task 1: Add PlantOverlay type and update PlantingRenderOptions

**Files:**
- Modify: `src/canvas/renderOptions.ts`

- [ ] **Step 1: Add PlantOverlay type and new fields to PlantingRenderOptions**

```typescript
// Add after the existing imports, before RenderOptions:

export interface PlantOverlay {
  footprintFill?: string;
  footprintOpacity?: number;
  spacingStroke?: string;
  spacingOpacity?: number;
  highlightRing?: {
    color: string;
    radiusFt: number;
    dashPattern?: number[];
  };
}
```

In `PlantingRenderOptions`, replace `showSpacing?: boolean` with:

```typescript
export interface PlantingRenderOptions extends RenderOptions {
  selectedIds?: string[];
  showSpacingBorders?: boolean;
  showFootprintCircles?: boolean;
  showMeasurements?: boolean;
  plantIconScale?: number;
  overlays?: Map<string, PlantOverlay>;
}
```

- [ ] **Step 2: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: Errors in files still referencing `showSpacing` — that's expected, we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/renderOptions.ts
git commit -m "feat: add PlantOverlay type and new rendering option fields"
```

---

### Task 2: Update uiStore — replace showPlantingSpacing with three toggles

**Files:**
- Modify: `src/store/uiStore.ts`
- Modify: `src/store/uiStore.test.ts`

- [ ] **Step 1: Update the test file — replace showPlantingSpacing tests**

Replace the `describe('showPlantingSpacing', ...)` block (lines 137–154) with:

```typescript
  describe('plant rendering toggles', () => {
    it('showSpacingBorders starts as true', () => {
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
    });

    it('showFootprintCircles starts as true', () => {
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
    });

    it('showMeasurements starts as false', () => {
      expect(useUiStore.getState().showMeasurements).toBe(false);
    });

    it('toggles showSpacingBorders on and off', () => {
      useUiStore.getState().setShowSpacingBorders(false);
      expect(useUiStore.getState().showSpacingBorders).toBe(false);
      useUiStore.getState().setShowSpacingBorders(true);
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
    });

    it('toggles showFootprintCircles on and off', () => {
      useUiStore.getState().setShowFootprintCircles(false);
      expect(useUiStore.getState().showFootprintCircles).toBe(false);
      useUiStore.getState().setShowFootprintCircles(true);
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
    });

    it('toggles showMeasurements on and off', () => {
      useUiStore.getState().setShowMeasurements(true);
      expect(useUiStore.getState().showMeasurements).toBe(true);
      useUiStore.getState().setShowMeasurements(false);
      expect(useUiStore.getState().showMeasurements).toBe(false);
    });

    it('resets all to defaults on store reset', () => {
      useUiStore.getState().setShowSpacingBorders(false);
      useUiStore.getState().setShowFootprintCircles(false);
      useUiStore.getState().setShowMeasurements(true);
      useUiStore.getState().reset();
      expect(useUiStore.getState().showSpacingBorders).toBe(true);
      expect(useUiStore.getState().showFootprintCircles).toBe(true);
      expect(useUiStore.getState().showMeasurements).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/uiStore.test.ts`
Expected: FAIL — `showSpacingBorders` etc. don't exist yet.

- [ ] **Step 3: Update uiStore.ts**

In the `UiStore` interface, replace:
```typescript
  showPlantingSpacing: boolean;
```
with:
```typescript
  showSpacingBorders: boolean;
  showFootprintCircles: boolean;
  showMeasurements: boolean;
```

Replace:
```typescript
  setShowPlantingSpacing: (show: boolean) => void;
```
with:
```typescript
  setShowSpacingBorders: (show: boolean) => void;
  setShowFootprintCircles: (show: boolean) => void;
  setShowMeasurements: (show: boolean) => void;
```

In the `create` defaults, replace:
```typescript
  showPlantingSpacing: false,
```
with:
```typescript
  showSpacingBorders: true,
  showFootprintCircles: true,
  showMeasurements: false,
```

Replace:
```typescript
  setShowPlantingSpacing: (show) => set({ showPlantingSpacing: show }),
```
with:
```typescript
  setShowSpacingBorders: (show) => set({ showSpacingBorders: show }),
  setShowFootprintCircles: (show) => set({ showFootprintCircles: show }),
  setShowMeasurements: (show) => set({ showMeasurements: show }),
```

In the `reset` method, replace:
```typescript
      showPlantingSpacing: false,
```
with:
```typescript
      showSpacingBorders: true,
      showFootprintCircles: true,
      showMeasurements: false,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/uiStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.test.ts
git commit -m "feat: replace showPlantingSpacing with three rendering toggles"
```

---

### Task 3: Update plantRenderers.ts — circle-clip and iconBgColor

**Files:**
- Modify: `src/canvas/plantRenderers.ts`

- [ ] **Step 1: Update renderPlant to accept iconBgColor and always clip to circle**

Change the `renderPlant` signature to:

```typescript
export function renderPlant(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
  shape: PlantShape = 'square',
  iconBgColor?: string | null,
): void {
```

Replace the body of `renderPlant` (the `if (dataUri)` block and fallback call) with:

```typescript
  const cultivar = getCultivar(cultivarId);
  const dataUri = cultivar?.iconImage;
  const bgColor = iconBgColor ?? cultivar?.iconBgColor ?? color;

  // Always draw the footprint circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.restore();

  if (dataUri) {
    const img = getImage(dataUri);
    if (img) {
      ctx.save();
      // Clip to circle regardless of shape
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      return;
    }
  }

  // Fallback: draw colored shape on top of the bg circle
  drawFallback(ctx, radius, color, shape);
```

- [ ] **Step 2: Update drawFallback to not draw its own background**

The fallback now renders on top of the already-drawn bg circle, so remove the fill from `drawFallback`. Replace the function body:

```typescript
function drawFallback(
  ctx: CanvasRenderingContext2D,
  radius: number,
  color: string,
  shape: PlantShape,
): void {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 3: Verify the project compiles (ignoring downstream errors)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: May show errors in files still referencing old `showSpacing` field — that's OK.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/plantRenderers.ts
git commit -m "feat: renderPlant always clips icon to circle with iconBgColor fill"
```

---

### Task 4: Update renderPlantings.ts — spacing borders, measurements, overlays

**Files:**
- Modify: `src/canvas/renderPlantings.ts`

- [ ] **Step 1: Update the imports**

Add `PlantOverlay` to the import from `renderOptions`:

```typescript
import type { OverlayRenderOptions, PlantingRenderOptions, PlantOverlay } from './renderOptions';
```

- [ ] **Step 2: Update the destructuring in renderPlantings**

Replace:
```typescript
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
```

with:

```typescript
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
```

- [ ] **Step 3: Replace the spacing rendering and update the plant render call**

In the per-plant loop, replace the `if (showSpacing) { ... }` block (the one drawing translucent squares, lines 95–108) and the `renderPlant` call section (lines 110–115) with:

```typescript
    const overlay = overlays?.get(p.id);

    // Draw spacing border
    if (showSpacingBorders) {
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

    const shape = isSingleFill && parent.shape === 'circle' ? 'circle' as const : 'square' as const;

    const footprintFill = overlay?.footprintFill ?? null;
    const footprintOpacity = overlay?.footprintOpacity ?? 1;

    ctx.save();
    ctx.translate(sx, sy);
    if (footprintOpacity !== 1) ctx.globalAlpha = footprintOpacity;
    renderPlant(ctx, p.cultivarId, radius, color, shape, showFootprintCircles ? (footprintFill ?? undefined) : 'transparent');
    ctx.restore();
```

- [ ] **Step 4: Add measurement label rendering after the plant render, before the label candidate section**

Insert after the `ctx.restore()` from Step 3 (before the `if (highlightOpacity > 0)` block):

```typescript
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
```

- [ ] **Step 5: Verify the project compiles (ignoring downstream caller errors)**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/canvas/renderPlantings.ts
git commit -m "feat: render spacing borders by container shape, add measurements and overlay support"
```

---

### Task 5: Update PlantingLayerRenderer and CanvasStack — wire new toggles

**Files:**
- Modify: `src/canvas/PlantingLayerRenderer.ts`
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Update PlantingLayerRenderer**

Replace the full file content:

```typescript
import type { Planting, Structure, Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { renderOverlayPlantings, renderPlantings } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  showSpacingBorders: boolean = true;
  showFootprintCircles: boolean = true;
  showMeasurements: boolean = false;
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  plantIconScale = 1;
  hideIds: string[] = [];
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;
    renderPlantings(ctx, visiblePlantings, this.zones, this.structures, {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      selectedIds: this.selectedIds,
      showSpacingBorders: this.showSpacingBorders,
      showFootprintCircles: this.showFootprintCircles,
      showMeasurements: this.showMeasurements,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      plantIconScale: this.plantIconScale,
    });
    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(ctx, this.overlayPlantings, this.zones, this.structures, {
        view: this.view,
        snapped: this.overlaySnapped,
      });
    }
  }
}
```

- [ ] **Step 2: Update CanvasStack.tsx — replace showPlantingSpacing references**

Replace the store selector (line 54):
```typescript
  const showPlantingSpacing = useUiStore((s) => s.showPlantingSpacing);
```
with:
```typescript
  const showSpacingBorders = useUiStore((s) => s.showSpacingBorders);
  const showFootprintCircles = useUiStore((s) => s.showFootprintCircles);
  const showMeasurements = useUiStore((s) => s.showMeasurements);
```

Replace the renderer assignment (line 200):
```typescript
  plantingRenderer.current.showSpacing = showPlantingSpacing;
```
with:
```typescript
  plantingRenderer.current.showSpacingBorders = showSpacingBorders;
  plantingRenderer.current.showFootprintCircles = showFootprintCircles;
  plantingRenderer.current.showMeasurements = showMeasurements;
```

In the `useLayerEffect` dependency array for the planting layer (line 250), replace `showPlantingSpacing` with `showSpacingBorders, showFootprintCircles, showMeasurements`.

- [ ] **Step 3: Verify the project compiles**

Run: `npx tsc --noEmit`
Expected: May still have errors in `LayerPropertiesPanel.tsx` — that's the next task.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/PlantingLayerRenderer.ts src/canvas/CanvasStack.tsx
git commit -m "feat: wire new rendering toggles through PlantingLayerRenderer and CanvasStack"
```

---

### Task 6: Update LayerPropertiesPanel — new debug toggles

**Files:**
- Modify: `src/components/sidebar/LayerPropertiesPanel.tsx`

- [ ] **Step 1: Update the Plantings section store selectors**

In `LayerPropertiesPanel()`, replace:
```typescript
  const showPlantingSpacing = useUiStore((s) => s.showPlantingSpacing);
  const setShowPlantingSpacing = useUiStore((s) => s.setShowPlantingSpacing);
```
with:
```typescript
  const showSpacingBorders = useUiStore((s) => s.showSpacingBorders);
  const setShowSpacingBorders = useUiStore((s) => s.setShowSpacingBorders);
  const showFootprintCircles = useUiStore((s) => s.showFootprintCircles);
  const setShowFootprintCircles = useUiStore((s) => s.setShowFootprintCircles);
  const showMeasurements = useUiStore((s) => s.showMeasurements);
  const setShowMeasurements = useUiStore((s) => s.setShowMeasurements);
```

- [ ] **Step 2: Replace the Plantings section toggle**

Replace the Plantings `LayerSection` content (the single "Show spacing areas" checkbox) with three toggles:

```tsx
      <LayerSection title="Plantings" layerId="plantings">
        <div className={f.grid}>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={showFootprintCircles}
              onChange={(e) => setShowFootprintCircles(e.target.checked)}
            />
            <span>Show footprint circles</span>
          </label>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={showSpacingBorders}
              onChange={(e) => setShowSpacingBorders(e.target.checked)}
            />
            <span>Show spacing borders</span>
          </label>
          <label className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={showMeasurements}
              onChange={(e) => setShowMeasurements(e.target.checked)}
            />
            <span>Show measurements</span>
          </label>
        </div>
      </LayerSection>
```

- [ ] **Step 3: Verify the project compiles cleanly**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/LayerPropertiesPanel.tsx
git commit -m "feat: replace spacing toggle with footprint, spacing, and measurements toggles"
```

---

### Task 7: Update renderOverlayPlantings — circle-clip during drag

**Files:**
- Modify: `src/canvas/renderPlantings.ts`

- [ ] **Step 1: Update renderOverlayPlantings to use iconBgColor in renderPlant call**

In `renderOverlayPlantings`, the `renderPlant` call (line 229) currently passes `color` and `shape`. Update it to also pass `iconBgColor`:

Find:
```typescript
    renderPlant(ctx, p.cultivarId, radius, color, shape);
```

Replace with:
```typescript
    const cultivarBgColor = cultivar?.iconBgColor ?? null;
    renderPlant(ctx, p.cultivarId, radius, color, shape, cultivarBgColor);
```

- [ ] **Step 2: Verify the project compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/canvas/renderPlantings.ts
git commit -m "feat: apply circle-clip rendering to drag overlay plantings"
```

---

### Task 8: Full build and visual verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: PASS — clean build with no errors.

- [ ] **Step 2: Visual verification in browser**

Open the app at http://localhost:53305/garden/ and verify:
1. Plants render as circular icons with `iconBgColor` fill
2. Dashed spacing borders appear around each plant
3. Spacing borders are square in rectangular containers, circular in pots
4. Debug panel shows three toggles: "Show footprint circles", "Show spacing borders", "Show measurements"
5. Toggling each works as expected
6. "Show measurements" displays ft values next to each plant
7. Dragging a plant shows the new circle-clipped rendering
8. Single-fill containers (pots with one plant) still fill the container

- [ ] **Step 3: Commit any visual fixes if needed**
