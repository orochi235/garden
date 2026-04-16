# Layer Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat layer list in the sidebar with a 3D rolodex-style SVG widget that animates between layer selections.

**Architecture:** Pure layout math module (`layerWidgetLayout.ts`) produces tile positions from arc geometry. React component (`LayerWidget.tsx`) renders SVG from those positions, handles click/wheel/key input, and animates transitions via `requestAnimationFrame` with ref-based DOM writes. Integrates with existing `useUiStore` for `activeLayer` state.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom), Zustand, CSS Modules, inline SVG.

**Spec:** `docs/superpowers/specs/2026-04-15-layer-widget-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/sidebar/layerWidgetLayout.ts` | Create | Pure functions: `computeLayout()`, `applyEasing()`, constants, types |
| `src/components/sidebar/layerWidgetLayout.test.ts` | Create | Unit tests for layout math |
| `src/components/sidebar/LayerWidget.tsx` | Create | React component: SVG render, animation, input handling |
| `src/components/sidebar/LayerWidget.module.css` | Create | Widget cursor/container styles |
| `src/components/sidebar/Sidebar.tsx` | Modify | Swap `LayerPanel` for `LayerWidget` |

---

### Task 1: Layout Math — Types and Constants

**Files:**
- Create: `src/components/sidebar/layerWidgetLayout.ts`
- Create: `src/components/sidebar/layerWidgetLayout.test.ts`

- [ ] **Step 1: Write failing test for `LAYERS` data and `layerIndex` / `layerIdFromIndex`**

```ts
// src/components/sidebar/layerWidgetLayout.test.ts
import { describe, it, expect } from 'vitest';
import { LAYERS, layerIndex, layerIdFromIndex } from './layerWidgetLayout';

describe('layerWidgetLayout', () => {
  describe('LAYERS', () => {
    it('has five entries with required color fields', () => {
      expect(LAYERS).toHaveLength(5);
      for (const l of LAYERS) {
        expect(l).toHaveProperty('id');
        expect(l).toHaveProperty('color');
        expect(l).toHaveProperty('side1');
        expect(l).toHaveProperty('side2');
      }
    });

    it('has plantings at index 0 and ground at index 4', () => {
      expect(LAYERS[0].id).toBe('plantings');
      expect(LAYERS[4].id).toBe('ground');
    });
  });

  describe('layerIndex / layerIdFromIndex', () => {
    it('maps plantings to 0', () => {
      expect(layerIndex('plantings')).toBe(0);
    });

    it('maps ground to 4', () => {
      expect(layerIndex('ground')).toBe(4);
    });

    it('round-trips all layers', () => {
      for (let i = 0; i < 5; i++) {
        expect(layerIndex(layerIdFromIndex(i))).toBe(i);
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement constants, types, and helper functions**

```ts
// src/components/sidebar/layerWidgetLayout.ts
import type { LayerId } from '../../model/types';

// ── Layer data ──────────────────────────────────────────────────────────────

export interface LayerStyle {
  id: LayerId;
  label: string;
  color: string;
  dark: string;
  side1: string;
  side2: string;
}

export const LAYERS: LayerStyle[] = [
  { id: 'plantings',  label: 'Plantings',  color: '#4A7C59', dark: '#3a6a48', side1: '#3f6d4e', side2: '#356042' },
  { id: 'zones',      label: 'Zones',      color: '#7FB069', dark: '#5c8a4a', side1: '#6a9a56', side2: '#5c8a4a' },
  { id: 'structures', label: 'Structures', color: '#D4A843', dark: '#a8832a', side1: '#c09530', side2: '#a8832a' },
  { id: 'blueprint',  label: 'Blueprint',  color: '#4A7CAF', dark: '#35608a', side1: '#3f6d9a', side2: '#35608a' },
  { id: 'ground',     label: 'Ground',     color: '#8B7355', dark: '#6b5540', side1: '#7a6349', side2: '#6b5540' },
];

const INDEX_MAP = Object.fromEntries(LAYERS.map((l, i) => [l.id, i])) as Record<LayerId, number>;

export function layerIndex(id: LayerId): number {
  return INDEX_MAP[id];
}

export function layerIdFromIndex(i: number): LayerId {
  return LAYERS[i].id;
}

// ── Geometry constants ──────────────────────────────────────────────────────

export const HALF_W = 44;
const SIDE_THICK = 2;
const ACTIVE_THICK_RATIO = 1.0;
const CAMERA_ANGLE_DEG = 5;
const CAM_FOLLOW = 0.5;
const ENDCAP_BIAS = 0.5;
const PLATE_GAP_DEG = 5;
const ARC_CURVE = 2.0;

export const TILE_OPACITY = 0.85;
export const SHADOW_BLUR = 2;
export const SHADOW_OFF = 2;
export const SHADOW_ALPHA = 0.5;
export const FLIP_SHADOW = true;
export const ANIM_DUR = 300;

const CENTER_Y = 60;
const SVG_H = 120;
const MARGIN = 8;
const CAM_RAD = CAMERA_ANGLE_DEG * Math.PI / 180;
const GAP_RAD = PLATE_GAP_DEG * Math.PI / 180;
const ARC_R = ARC_CURVE > 0.01 ? HALF_W * 3 / ARC_CURVE : 100000;

// ── Tile state type ─────────────────────────────────────────────────────────

export interface TileState {
  index: number;
  y: number;
  tilt: number;
  dir: number;      // 1 = below active (sides hang down), -1 = above (sides go up)
  viewAngle: number;
  z: number;
  thick: number;    // projected side-face thickness
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/layerWidgetLayout.ts src/components/sidebar/layerWidgetLayout.test.ts
git commit -m "feat(layer-widget): add layer data, constants, and index helpers"
```

---

### Task 2: Layout Math — `computeLayout()`

**Files:**
- Modify: `src/components/sidebar/layerWidgetLayout.ts`
- Modify: `src/components/sidebar/layerWidgetLayout.test.ts`

- [ ] **Step 1: Write failing tests for `computeLayout()`**

Add to the test file:

```ts
import { computeLayout, LAYERS, HALF_W } from './layerWidgetLayout';

describe('computeLayout', () => {
  it('returns one tile per layer', () => {
    const tiles = computeLayout(0);
    expect(tiles).toHaveLength(LAYERS.length);
  });

  it('active tile has the smallest tilt (most face-on)', () => {
    const tiles = computeLayout(2);
    const activeTilt = tiles[2].tilt;
    for (let i = 0; i < tiles.length; i++) {
      if (i !== 2) expect(tiles[i].tilt).toBeGreaterThanOrEqual(activeTilt);
    }
  });

  it('tiles are ordered top-to-bottom by y position', () => {
    const tiles = computeLayout(0);
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].y).toBeGreaterThan(tiles[i - 1].y);
    }
  });

  it('all tiles fit within the SVG viewBox height (0..120)', () => {
    for (let active = 0; active < LAYERS.length; active++) {
      const tiles = computeLayout(active);
      for (const t of tiles) {
        expect(t.y - t.tilt).toBeGreaterThanOrEqual(-5);
        expect(t.y + t.tilt).toBeLessThanOrEqual(125);
      }
    }
  });

  it('dir is -1 for tiles above active, 1 for tiles below', () => {
    const tiles = computeLayout(2);
    expect(tiles[0].dir).toBe(-1);
    expect(tiles[1].dir).toBe(-1);
    expect(tiles[3].dir).toBe(1);
    expect(tiles[4].dir).toBe(1);
  });

  it('active tile dir is 1 (camera looks down)', () => {
    const tiles = computeLayout(2);
    expect(tiles[2].dir).toBe(1);
  });

  it('tilt is always positive and at least 0.5', () => {
    for (let active = 0; active < LAYERS.length; active++) {
      const tiles = computeLayout(active);
      for (const t of tiles) {
        expect(t.tilt).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('thick is always non-negative', () => {
    const tiles = computeLayout(2);
    for (const t of tiles) {
      expect(t.thick).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: FAIL — `computeLayout` not exported.

- [ ] **Step 3: Implement `computeLayout()`**

Add to `layerWidgetLayout.ts`:

```ts
export function computeLayout(activeIdx: number): TileState[] {
  const n = LAYERS.length;
  const tiles: TileState[] = [];

  for (let i = 0; i < n; i++) {
    const rel = i - activeIdx;
    const arcAngle = rel * GAP_RAD;

    const y3d = ARC_R * Math.sin(arcAngle);
    const z3d = ARC_R * (1 - Math.cos(arcAngle));

    // Endcap bias: extra tilt at stack edges (tilt only, not position)
    const distToEdge = Math.min(i, n - 1 - i);
    const maxDistToEdge = Math.floor((n - 1) / 2);
    const extremeness = maxDistToEdge > 0 ? 1 - distToEdge / maxDistToEdge : 1;
    const endcapExtra = extremeness * ENDCAP_BIAS * GAP_RAD;
    const plateTilt = (arcAngle * ARC_CURVE) + (Math.sign(rel) * endcapExtra);

    const screenY = CENTER_Y + y3d * Math.cos(CAM_RAD) + z3d * Math.sin(CAM_RAD);
    const viewAngle = Math.abs(plateTilt) + CAM_RAD;
    const tiltY = Math.max(0.5, HALF_W * Math.sin(Math.min(viewAngle, Math.PI / 2)));

    const dir = rel === 0 ? (CAM_RAD > 0 ? 1 : 0) : (rel > 0 ? 1 : -1);

    const baseThick = (i === activeIdx ? SIDE_THICK * ACTIVE_THICK_RATIO : SIDE_THICK);
    const thickScale = Math.cos(Math.min(viewAngle, Math.PI / 2));
    const thick = baseThick * Math.max(0.1, thickScale);

    tiles[i] = { index: i, y: screenY, tilt: tiltY, dir, viewAngle, z: z3d, thick };
  }

  // Normalize: scale positions (not tilts) to fit within SVG
  const topTile = tiles.reduce((a, b) => a.y - a.tilt < b.y - b.tilt ? a : b);
  const botTile = tiles.reduce((a, b) => a.y + a.tilt > b.y + b.tilt ? a : b);
  const posSpan = botTile.y - topTile.y || 1;
  const tiltOverhead = topTile.tilt + botTile.tilt;
  const targetSpan = SVG_H - 2 * MARGIN;
  const scale = Math.min(1, (targetSpan - tiltOverhead) / posSpan);

  const posMid = (topTile.y + botTile.y) / 2;
  const activeY = tiles[activeIdx].y;
  const anchor = posMid + (activeY - posMid) * CAM_FOLLOW;

  for (const t of tiles) {
    t.y = CENTER_Y + (t.y - anchor) * scale;
  }

  return tiles;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/layerWidgetLayout.ts src/components/sidebar/layerWidgetLayout.test.ts
git commit -m "feat(layer-widget): implement computeLayout with 3D arc geometry"
```

---

### Task 3: Layout Math — `applyEasing()` and `buildSvgMarkup()`

**Files:**
- Modify: `src/components/sidebar/layerWidgetLayout.ts`
- Modify: `src/components/sidebar/layerWidgetLayout.test.ts`

- [ ] **Step 1: Write failing tests for `applyEasing()`**

Add to test file:

```ts
import { applyEasing } from './layerWidgetLayout';

describe('applyEasing', () => {
  it('returns 0 at t=0', () => {
    expect(applyEasing(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(applyEasing(1)).toBe(1);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0.1; t <= 1; t += 0.1) {
      const v = applyEasing(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('is faster than linear at the start (ease-out)', () => {
    expect(applyEasing(0.5)).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: FAIL — `applyEasing` not exported.

- [ ] **Step 3: Implement `applyEasing()` and `buildSvgMarkup()`**

Add to `layerWidgetLayout.ts`:

```ts
// ── Easing ──────────────────────────────────────────────────────────────────

/** Cubic ease-out: fast start, smooth deceleration. */
export function applyEasing(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── SVG rendering ───────────────────────────────────────────────────────────

function lighten(hex: string, amt: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * Builds the inner SVG markup (defs + tile groups) for the widget.
 * Called from the React component for both static renders and animation frames.
 */
export function buildSvgMarkup(tiles: TileState[], activeIdx: number): string {
  const cx = HALF_W + 4; // horizontal center within viewBox

  // Z-order: furthest first, active always last
  const sorted = [...tiles].sort((a, b) => {
    if (a.index === activeIdx) return 1;
    if (b.index === activeIdx) return -1;
    return b.z - a.z;
  });

  let defs = '';
  let content = '';

  // Shadow filters
  for (let i = 0; i < LAYERS.length; i++) {
    const t = tiles[i];
    const sDir = FLIP_SHADOW ? (t.dir <= 0 ? -1 : 1) : 1;
    const angleFactor = Math.max(0.3, 1 - Math.sin(t.viewAngle) * 0.5);
    defs += `<filter id="sh${i}" x="-30%" y="-40%" width="160%" height="200%">` +
      `<feDropShadow dx="0" dy="${sDir * SHADOW_OFF * angleFactor}" ` +
      `stdDeviation="${SHADOW_BLUR * angleFactor}" flood-color="#000" flood-opacity="${SHADOW_ALPHA}"/>` +
      `</filter>`;
  }

  // Render tiles
  for (const t of sorted) {
    const layer = LAYERS[t.index];
    const isActive = t.index === activeIdx;
    const tiltY = t.tilt;
    const opacity = isActive ? 0.95 : TILE_OPACITY;
    const thick = t.thick;

    const filterAttr = `filter="url(#sh${t.index})"`;
    content += `<g ${filterAttr}>`;
    content += `<g transform="translate(${cx},${t.y})" data-idx="${t.index}" class="tile">`;

    if (tiltY < 0.3) {
      content += `<line x1="${-HALF_W}" y1="0" x2="${HALF_W}" y2="0" stroke="${layer.side1}" stroke-width="0.5"/>`;
    } else {
      const topPts = `0,${-tiltY} ${HALF_W},0 0,${tiltY} ${-HALF_W},0`;

      // Side faces
      if (thick > 0) {
        if (t.dir < 0) {
          content += `<polygon points="0,${-tiltY} ${HALF_W},0 ${HALF_W},${-thick} 0,${-tiltY - thick}" fill="${layer.side1}" opacity="${opacity}"/>`;
          content += `<polygon points="0,${-tiltY} ${-HALF_W},0 ${-HALF_W},${-thick} 0,${-tiltY - thick}" fill="${layer.side2}" opacity="${opacity}"/>`;
        } else {
          content += `<polygon points="0,${tiltY} ${HALF_W},0 ${HALF_W},${thick} 0,${tiltY + thick}" fill="${layer.side1}" opacity="${opacity}"/>`;
          content += `<polygon points="0,${tiltY} ${-HALF_W},0 ${-HALF_W},${thick} 0,${tiltY + thick}" fill="${layer.side2}" opacity="${opacity}"/>`;
        }
      }

      // Top face
      content += `<polygon points="${topPts}" fill="${layer.color}" opacity="${opacity}"/>`;
    }

    content += `</g></g>`;
  }

  return `<defs>${defs}</defs>${content}`;
}

/** The viewBox width for the widget SVG. */
export const SVG_W = HALF_W * 2 + 8;
export { SVG_H };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sidebar/layerWidgetLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/layerWidgetLayout.ts src/components/sidebar/layerWidgetLayout.test.ts
git commit -m "feat(layer-widget): add easing function and SVG markup builder"
```

---

### Task 4: React Component — Static Render

**Files:**
- Create: `src/components/sidebar/LayerWidget.tsx`
- Create: `src/components/sidebar/LayerWidget.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/components/sidebar/LayerWidget.module.css */
.container {
  padding: 8px;
}

.container svg {
  display: block;
  width: 100%;
  height: auto;
}

.container .tile {
  cursor: pointer;
}
```

- [ ] **Step 2: Create the component with static rendering**

```tsx
// src/components/sidebar/LayerWidget.tsx
import { useRef, useEffect, useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import {
  LAYERS,
  layerIndex,
  layerIdFromIndex,
  computeLayout,
  buildSvgMarkup,
  applyEasing,
  SVG_W,
  SVG_H,
  ANIM_DUR,
} from './layerWidgetLayout';
import type { TileState } from './layerWidgetLayout';
import styles from './LayerWidget.module.css';

export function LayerWidget() {
  const activeLayer = useUiStore((s) => s.activeLayer);
  const setActiveLayer = useUiStore((s) => s.setActiveLayer);
  const activeIdx = layerIndex(activeLayer);

  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number | null>(null);
  const animatingRef = useRef(false);

  // Render static layout
  const renderLayout = useCallback((tiles: TileState[], active: number) => {
    if (!svgRef.current) return;
    svgRef.current.innerHTML = buildSvgMarkup(tiles, active);
  }, []);

  // Static render on activeLayer change (when not animating)
  useEffect(() => {
    if (animatingRef.current) return;
    renderLayout(computeLayout(activeIdx), activeIdx);
  }, [activeIdx, renderLayout]);

  // Click handler — delegate from SVG
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const tile = (e.target as Element).closest('.tile');
    if (!tile) return;
    const idx = parseInt(tile.getAttribute('data-idx') ?? '', 10);
    if (isNaN(idx) || animatingRef.current) return;
    switchTo(idx);
  }, []);

  function switchTo(newIdx: number) {
    const currentIdx = layerIndex(useUiStore.getState().activeLayer);
    if (newIdx < 0 || newIdx >= LAYERS.length || newIdx === currentIdx) return;

    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    animatingRef.current = true;

    const oldLayout = computeLayout(currentIdx);
    const newLayout = computeLayout(newIdx);
    const startTime = performance.now();

    function frame(now: number) {
      const rawT = Math.min((now - startTime) / ANIM_DUR, 1);
      const t = applyEasing(rawT);
      const interp: TileState[] = oldLayout.map((old, i) => ({
        index: i,
        y: old.y + (newLayout[i].y - old.y) * t,
        tilt: old.tilt + (newLayout[i].tilt - old.tilt) * t,
        dir: newLayout[i].dir,
        viewAngle: old.viewAngle + (newLayout[i].viewAngle - old.viewAngle) * t,
        z: old.z + (newLayout[i].z - old.z) * t,
        thick: old.thick + (newLayout[i].thick - old.thick) * t,
      }));
      renderLayout(interp, newIdx);
      if (rawT < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        animatingRef.current = false;
        animRef.current = null;
        setActiveLayer(layerIdFromIndex(newIdx));
      }
    }

    animRef.current = requestAnimationFrame(frame);
  }

  // Wheel handler
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (animatingRef.current) return;
    const current = layerIndex(useUiStore.getState().activeLayer);
    if (e.deltaY > 0 && current < LAYERS.length - 1) switchTo(current + 1);
    else if (e.deltaY < 0 && current > 0) switchTo(current - 1);
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (animatingRef.current) return;
    const current = layerIndex(useUiStore.getState().activeLayer);
    if (e.key === 'ArrowDown' && current < LAYERS.length - 1) {
      e.preventDefault();
      switchTo(current + 1);
    } else if (e.key === 'ArrowUp' && current > 0) {
      e.preventDefault();
      switchTo(current - 1);
    }
  }, []);

  // Attach wheel listener (needs passive: false)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className={styles.container} tabIndex={0} onKeyDown={handleKeyDown}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        onClick={handleClick}
        style={{ overflow: 'visible' }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/LayerWidget.tsx src/components/sidebar/LayerWidget.module.css
git commit -m "feat(layer-widget): add LayerWidget React component with animation"
```

---

### Task 5: Integrate into Sidebar

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`

- [ ] **Step 1: Replace LayerPanel with LayerWidget in Sidebar**

Replace the contents of `src/components/sidebar/Sidebar.tsx` with:

```tsx
import { LayerWidget } from './LayerWidget';
import { PropertiesPanel } from './PropertiesPanel';
import { LayerPropertiesPanel } from './LayerPropertiesPanel';
import styles from '../../styles/Sidebar.module.css';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <LayerWidget />
      <div className={styles.divider} />
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPropertiesPanel />
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Verify in browser:
- Widget renders in the right sidebar, showing 5 diamond tiles stacked vertically
- Clicking a tile switches the active layer (animates)
- Mouse wheel scrolls through layers
- Arrow keys (up/down) switch layers when widget is focused
- The rest of the app (canvas, properties panels) continues to work

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat(layer-widget): integrate widget into sidebar, replacing LayerPanel"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 3: Commit any fixups if needed, then push**

```bash
git push origin main
```
