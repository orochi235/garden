# Garden Layout Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based garden layout planner where users drag objects from a palette onto a layered, top-down grid canvas, and save/load designs as `.garden` files.

**Architecture:** React 19 + TypeScript 6 SPA built with Vite. Zustand manages app state (garden data, UI state). The canvas area uses stacked HTML `<canvas>` elements — one per render layer — with a React overlay for selection handles. A left palette panel provides draggable objects, and a right sidebar shows properties and layer controls.

**Tech Stack:** React 19, TypeScript 6, Vite (latest stable — verify npm), Zustand, HTML Canvas, Vitest, CSS Modules

**Spec:** `docs/superpowers/specs/2026-04-14-garden-planner-design.md`

---

## File Structure

```
src/
  model/
    types.ts              # All data types: Garden, Structure, Zone, Planting, Blueprint, LayerId, DisplayUnit
  utils/
    id.ts                 # UUID generation
    units.ts              # Unit conversion: feet ↔ display unit
    grid.ts               # Grid snap, coordinate transforms (screen ↔ world)
    file.ts               # Save/load .garden files, localStorage autosave
  store/
    gardenStore.ts        # Zustand store: garden data, CRUD for structures/zones/plantings
    uiStore.ts            # Zustand store: active layer, selection, zoom, pan, drag state, layer visibility/opacity/lock
  canvas/
    useCanvasSize.ts      # Hook: tracks container size, handles devicePixelRatio
    renderGrid.ts         # Draws ground grid onto a canvas context
    renderStructures.ts   # Draws structures onto a canvas context
    renderZones.ts        # Draws zones onto a canvas context
    renderPlantings.ts    # Draws plantings onto a canvas context
    renderBlueprint.ts    # Draws blueprint image onto a canvas context
    renderSelection.ts    # Draws selection outlines + resize handles onto overlay canvas
    renderDragPreview.ts  # Draws ghost preview of object being dragged from palette
    hitTest.ts            # Point-in-object detection for click/select
    CanvasStack.tsx       # React component: manages stacked <canvas> elements, wires up rendering
  components/
    App.tsx               # Root layout: menu bar, left panel, canvas, right panel, status bar
    MenuBar.tsx           # Top menu bar (Garden Planner title, File/Edit/View menus)
    StatusBar.tsx          # Bottom status bar (grid size, zoom, selection info)
    palette/
      ObjectPalette.tsx   # Left panel: categorized object library with search
      PaletteItem.tsx     # Single draggable item in the palette
      paletteData.ts      # Static catalog of available objects per category
    sidebar/
      Sidebar.tsx         # Right panel container: properties + layers
      PropertiesPanel.tsx # Object properties editor (or garden settings when nothing selected)
      LayerPanel.tsx      # Layer visibility, opacity, lock, active selection
  styles/
    global.css            # CSS custom properties (color palette), base reset
    App.module.css        # App layout grid
    MenuBar.module.css
    StatusBar.module.css
    ObjectPalette.module.css
    PaletteItem.module.css
    Sidebar.module.css
    PropertiesPanel.module.css
    LayerPanel.module.css
  main.tsx                # Entry point: renders App
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/styles/global.css`

- [ ] **Step 1: Verify latest Vite version on npm**

Run: `npm view vite version`

Note the version. If it's 8.x, use it. If not, use whatever is latest stable.

- [ ] **Step 2: Scaffold the Vite project**

Run from the repo root:

```bash
npm create vite@latest . -- --template react-ts
```

If prompted about existing files, allow overwrite (the repo only has the docs folder and git files).

- [ ] **Step 3: Verify and pin dependency versions**

Run:

```bash
npm view react version
npm view react-dom version
npm view typescript version
npm view zustand version
npm view vitest version
```

Update `package.json` to ensure:
- `react` and `react-dom` are 19.x
- `typescript` is 6.x
- Add `zustand` as a dependency
- Add `vitest`, `jsdom`, and `@testing-library/react` as devDependencies

Run: `npm install`

- [ ] **Step 4: Configure Vitest**

Add to `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write a smoke test**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test`

Expected: 1 test passes.

- [ ] **Step 8: Create global CSS with color palette**

Replace `src/styles/global.css` (delete any Vite-generated CSS files like `App.css`, `index.css`):

```css
:root {
  /* Earth tones */
  --color-soil: #5C4033;
  --color-soil-light: #8B6914;
  --color-terracotta: #C75B39;
  --color-sand: #E8D5B7;
  --color-cream: #FFF8F0;

  /* Greens */
  --color-leaf: #4A7C59;
  --color-leaf-light: #7FB069;
  --color-moss: #2D5A27;

  /* Accents */
  --color-sky: #5BA4CF;
  --color-sun: #F2C94C;
  --color-bloom: #E07B9B;

  /* UI chrome */
  --color-bg: var(--color-cream);
  --color-panel: #F5EDE0;
  --color-panel-border: #D4C4A8;
  --color-text: #3A2E22;
  --color-text-muted: #8A7D6B;

  /* Sizing */
  --panel-width: 240px;
  --menu-height: 40px;
  --status-height: 28px;
  --border-radius: 6px;

  font-family: system-ui, -apple-system, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

#root {
  height: 100%;
  width: 100%;
}
```

Update `index.html` to import `src/styles/global.css` (via `main.tsx`).

- [ ] **Step 9: Create minimal App and main.tsx**

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `src/components/App.tsx`:

```tsx
export function App() {
  return <div>Garden Planner</div>;
}
```

- [ ] **Step 10: Verify dev server starts**

Run: `npm run dev`

Expected: App loads in browser showing "Garden Planner". Stop the dev server.

- [ ] **Step 11: Clean up generated files**

Delete any Vite-generated files that are no longer needed: `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/`, `src/logo.svg`, etc. Only keep `src/main.tsx`, `src/components/App.tsx`, `src/styles/global.css`, and `src/smoke.test.ts`.

- [ ] **Step 12: Add .gitignore entries**

Ensure `.gitignore` includes:

```
node_modules
dist
.superpowers
```

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Vite, React 19, TypeScript 6, Zustand, Vitest"
```

---

### Task 2: Data Model Types

**Files:**
- Create: `src/model/types.ts`
- Test: `src/model/types.test.ts`

- [ ] **Step 1: Write type validation tests**

Create `src/model/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Garden, Structure, Zone, Planting, Blueprint, LayerId, DisplayUnit } from './types';
import { createGarden, createStructure, createZone, createPlanting } from './types';

describe('factory functions', () => {
  it('createGarden returns valid defaults', () => {
    const g = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
    expect(g.id).toBeTruthy();
    expect(g.version).toBe(1);
    expect(g.name).toBe('Test');
    expect(g.widthFt).toBe(20);
    expect(g.heightFt).toBe(15);
    expect(g.gridCellSizeFt).toBe(1);
    expect(g.displayUnit).toBe('ft');
    expect(g.blueprint).toBeNull();
    expect(g.structures).toEqual([]);
    expect(g.zones).toEqual([]);
    expect(g.plantings).toEqual([]);
  });

  it('createStructure returns valid defaults', () => {
    const s = createStructure({ type: 'raised-bed', x: 2, y: 3, width: 4, height: 8 });
    expect(s.id).toBeTruthy();
    expect(s.type).toBe('raised-bed');
    expect(s.x).toBe(2);
    expect(s.y).toBe(3);
    expect(s.width).toBe(4);
    expect(s.height).toBe(8);
    expect(s.rotation).toBe(0);
    expect(s.color).toBeTruthy();
    expect(s.label).toBe('');
    expect(s.zIndex).toBe(0);
    expect(s.parentId).toBeNull();
    expect(s.snapToGrid).toBe(true);
  });

  it('createZone returns valid defaults', () => {
    const z = createZone({ x: 1, y: 1, width: 3, height: 3 });
    expect(z.id).toBeTruthy();
    expect(z.x).toBe(1);
    expect(z.width).toBe(3);
    expect(z.zIndex).toBe(0);
    expect(z.parentId).toBeNull();
    expect(z.soilType).toBeNull();
    expect(z.sunExposure).toBeNull();
  });

  it('createPlanting returns valid defaults', () => {
    const p = createPlanting({ zoneId: 'zone-1', x: 0.5, y: 0.5, name: 'Tomato' });
    expect(p.id).toBeTruthy();
    expect(p.zoneId).toBe('zone-1');
    expect(p.name).toBe('Tomato');
    expect(p.variety).toBeNull();
    expect(p.icon).toBeNull();
    expect(p.spacingFt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement types and factory functions**

Create `src/model/types.ts`:

```ts
export type DisplayUnit = 'ft' | 'in' | 'm' | 'cm';

export type LayerId = 'ground' | 'blueprint' | 'structures' | 'zones' | 'plantings';

export interface Blueprint {
  imageData: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface Structure {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  label: string;
  zIndex: number;
  parentId: string | null;
  snapToGrid: boolean;
}

export interface Zone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  zIndex: number;
  parentId: string | null;
  soilType: string | null;
  sunExposure: string | null;
}

export interface Planting {
  id: string;
  zoneId: string;
  x: number;
  y: number;
  name: string;
  color: string;
  icon: string | null;
  variety: string | null;
  spacingFt: number | null;
}

export interface Garden {
  id: string;
  version: number;
  name: string;
  widthFt: number;
  heightFt: number;
  gridCellSizeFt: number;
  displayUnit: DisplayUnit;
  blueprint: Blueprint | null;
  structures: Structure[];
  zones: Zone[];
  plantings: Planting[];
}

let _idCounter = 0;
export function generateId(): string {
  return crypto.randomUUID?.() ?? `id-${++_idCounter}-${Date.now()}`;
}

export function createGarden(opts: { name: string; widthFt: number; heightFt: number }): Garden {
  return {
    id: generateId(),
    version: 1,
    name: opts.name,
    widthFt: opts.widthFt,
    heightFt: opts.heightFt,
    gridCellSizeFt: 1,
    displayUnit: 'ft',
    blueprint: null,
    structures: [],
    zones: [],
    plantings: [],
  };
}

const DEFAULT_STRUCTURE_COLORS: Record<string, string> = {
  'raised-bed': '#8B6914',
  'pot': '#C75B39',
  'fence': '#5C4033',
  'path': '#D4C4A8',
  'patio': '#A0926B',
};

export function createStructure(opts: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Structure {
  return {
    id: generateId(),
    type: opts.type,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: 0,
    color: DEFAULT_STRUCTURE_COLORS[opts.type] ?? '#8B6914',
    label: '',
    zIndex: 0,
    parentId: null,
    snapToGrid: true,
  };
}

export function createZone(opts: { x: number; y: number; width: number; height: number }): Zone {
  return {
    id: generateId(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    color: '#7FB06944',
    label: '',
    zIndex: 0,
    parentId: null,
    soilType: null,
    sunExposure: null,
  };
}

export function createPlanting(opts: {
  zoneId: string;
  x: number;
  y: number;
  name: string;
}): Planting {
  return {
    id: generateId(),
    zoneId: opts.zoneId,
    x: opts.x,
    y: opts.y,
    name: opts.name,
    color: '#4A7C59',
    icon: null,
    variety: null,
    spacingFt: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/
git commit -m "feat: add data model types and factory functions"
```

---

### Task 3: Utility Functions

**Files:**
- Create: `src/utils/id.ts`, `src/utils/units.ts`, `src/utils/grid.ts`
- Test: `src/utils/units.test.ts`, `src/utils/grid.test.ts`

- [ ] **Step 1: Write unit conversion tests**

Create `src/utils/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { feetToDisplay, displayToFeet, unitLabel } from './units';

describe('feetToDisplay', () => {
  it('converts feet to feet (identity)', () => {
    expect(feetToDisplay(3, 'ft')).toBeCloseTo(3);
  });

  it('converts feet to inches', () => {
    expect(feetToDisplay(2, 'in')).toBeCloseTo(24);
  });

  it('converts feet to meters', () => {
    expect(feetToDisplay(1, 'm')).toBeCloseTo(0.3048);
  });

  it('converts feet to centimeters', () => {
    expect(feetToDisplay(1, 'cm')).toBeCloseTo(30.48);
  });
});

describe('displayToFeet', () => {
  it('converts inches to feet', () => {
    expect(displayToFeet(24, 'in')).toBeCloseTo(2);
  });

  it('converts meters to feet', () => {
    expect(displayToFeet(1, 'm')).toBeCloseTo(3.28084, 3);
  });
});

describe('unitLabel', () => {
  it('returns correct labels', () => {
    expect(unitLabel('ft')).toBe('ft');
    expect(unitLabel('in')).toBe('in');
    expect(unitLabel('m')).toBe('m');
    expect(unitLabel('cm')).toBe('cm');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement unit conversion**

Create `src/utils/units.ts`:

```ts
import type { DisplayUnit } from '../model/types';

const FEET_PER: Record<DisplayUnit, number> = {
  ft: 1,
  in: 1 / 12,
  m: 3.28084,
  cm: 0.0328084,
};

export function feetToDisplay(feet: number, unit: DisplayUnit): number {
  return feet / FEET_PER[unit];
}

export function displayToFeet(value: number, unit: DisplayUnit): number {
  return value * FEET_PER[unit];
}

export function unitLabel(unit: DisplayUnit): string {
  return unit;
}

export function formatMeasurement(feet: number, unit: DisplayUnit, decimals = 1): string {
  const value = feetToDisplay(feet, unit);
  return `${value.toFixed(decimals)} ${unitLabel(unit)}`;
}
```

- [ ] **Step 4: Run unit conversion tests**

Run: `npm test`

Expected: All unit tests pass.

- [ ] **Step 5: Write grid utility tests**

Create `src/utils/grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { snapToGrid, worldToScreen, screenToWorld } from './grid';

describe('snapToGrid', () => {
  it('snaps to nearest grid cell', () => {
    expect(snapToGrid(2.3, 1)).toBe(2);
    expect(snapToGrid(2.7, 1)).toBe(3);
    expect(snapToGrid(2.5, 1)).toBe(3);
  });

  it('works with non-1 grid sizes', () => {
    expect(snapToGrid(1.3, 0.5)).toBe(1.5);
    expect(snapToGrid(1.1, 0.5)).toBe(1);
  });

  it('handles zero and negative', () => {
    expect(snapToGrid(0, 1)).toBe(0);
    expect(snapToGrid(-0.3, 1)).toBe(0);
    expect(snapToGrid(-0.7, 1)).toBe(-1);
  });
});

describe('worldToScreen / screenToWorld', () => {
  const view = { panX: 10, panY: 20, zoom: 2 };

  it('converts world to screen coordinates', () => {
    const [sx, sy] = worldToScreen(5, 3, view);
    expect(sx).toBe(10 + 5 * 2);
    expect(sy).toBe(20 + 3 * 2);
  });

  it('converts screen to world coordinates', () => {
    const [wx, wy] = screenToWorld(20, 26, view);
    expect(wx).toBe(5);
    expect(wy).toBe(3);
  });

  it('roundtrips correctly', () => {
    const [sx, sy] = worldToScreen(7, 11, view);
    const [wx, wy] = screenToWorld(sx, sy, view);
    expect(wx).toBeCloseTo(7);
    expect(wy).toBeCloseTo(11);
  });
});
```

- [ ] **Step 6: Run grid tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 7: Implement grid utilities**

Create `src/utils/grid.ts`:

```ts
export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export function snapToGrid(value: number, cellSize: number): number {
  return Math.round(value / cellSize) * cellSize;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  view: ViewTransform,
): [number, number] {
  return [view.panX + worldX * view.zoom, view.panY + worldY * view.zoom];
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  view: ViewTransform,
): [number, number] {
  return [(screenX - view.panX) / view.zoom, (screenY - view.panY) / view.zoom];
}
```

- [ ] **Step 8: Create ID utility**

Create `src/utils/id.ts`:

```ts
export { generateId } from '../model/types';
```

- [ ] **Step 9: Run all tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/utils/
git commit -m "feat: add unit conversion and grid snap utilities"
```

---

### Task 4: Zustand Stores

**Files:**
- Create: `src/store/gardenStore.ts`, `src/store/uiStore.ts`
- Test: `src/store/gardenStore.test.ts`, `src/store/uiStore.test.ts`

- [ ] **Step 1: Write garden store tests**

Create `src/store/gardenStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGardenStore } from './gardenStore';

describe('gardenStore', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('initializes with a default garden', () => {
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('My Garden');
    expect(garden.widthFt).toBe(20);
    expect(garden.heightFt).toBe(20);
    expect(garden.structures).toEqual([]);
    expect(garden.zones).toEqual([]);
    expect(garden.plantings).toEqual([]);
  });

  it('adds a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
    const { garden } = useGardenStore.getState();
    expect(garden.structures).toHaveLength(1);
    expect(garden.structures[0].type).toBe('raised-bed');
  });

  it('removes a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'pot', x: 1, y: 1, width: 2, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().removeStructure(id);
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('updates a structure', () => {
    const { addStructure } = useGardenStore.getState();
    addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 8 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useGardenStore.getState().updateStructure(id, { label: 'Herbs', x: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    expect(s.label).toBe('Herbs');
    expect(s.x).toBe(5);
    expect(s.width).toBe(4);
  });

  it('adds a zone', () => {
    const { addZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
  });

  it('removes a zone and its plantings', () => {
    const { addZone, addPlanting, removeZone } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ zoneId, x: 0.5, y: 0.5, name: 'Tomato' });
    expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    removeZone(zoneId);
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('adds a planting', () => {
    const { addZone, addPlanting } = useGardenStore.getState();
    addZone({ x: 0, y: 0, width: 3, height: 3 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    addPlanting({ zoneId, x: 1, y: 1, name: 'Basil' });
    const p = useGardenStore.getState().garden.plantings[0];
    expect(p.name).toBe('Basil');
    expect(p.zoneId).toBe(zoneId);
  });

  it('updates garden settings', () => {
    useGardenStore.getState().updateGarden({ name: 'Backyard', widthFt: 40 });
    const { garden } = useGardenStore.getState();
    expect(garden.name).toBe('Backyard');
    expect(garden.widthFt).toBe(40);
    expect(garden.heightFt).toBe(20);
  });

  it('loads a garden from JSON', () => {
    const { loadGarden } = useGardenStore.getState();
    const data = {
      id: 'test-id',
      version: 1,
      name: 'Loaded',
      widthFt: 30,
      heightFt: 25,
      gridCellSizeFt: 0.5,
      displayUnit: 'ft' as const,
      blueprint: null,
      structures: [],
      zones: [],
      plantings: [],
    };
    loadGarden(data);
    expect(useGardenStore.getState().garden.name).toBe('Loaded');
    expect(useGardenStore.getState().garden.gridCellSizeFt).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement garden store**

Create `src/store/gardenStore.ts`:

```ts
import { create } from 'zustand';
import type { Garden, Structure, Zone, Planting, Blueprint } from '../model/types';
import { createGarden, createStructure, createZone, createPlanting } from '../model/types';

interface GardenStore {
  garden: Garden;

  // Garden-level
  updateGarden: (updates: Partial<Pick<Garden, 'name' | 'widthFt' | 'heightFt' | 'gridCellSizeFt' | 'displayUnit'>>) => void;
  loadGarden: (garden: Garden) => void;
  reset: () => void;

  // Blueprint
  setBlueprint: (blueprint: Blueprint | null) => void;

  // Structures
  addStructure: (opts: { type: string; x: number; y: number; width: number; height: number }) => void;
  updateStructure: (id: string, updates: Partial<Omit<Structure, 'id'>>) => void;
  removeStructure: (id: string) => void;

  // Zones
  addZone: (opts: { x: number; y: number; width: number; height: number }) => void;
  updateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  removeZone: (id: string) => void;

  // Plantings
  addPlanting: (opts: { zoneId: string; x: number; y: number; name: string }) => void;
  updatePlanting: (id: string, updates: Partial<Omit<Planting, 'id'>>) => void;
  removePlanting: (id: string) => void;
}

function defaultGarden(): Garden {
  return createGarden({ name: 'My Garden', widthFt: 20, heightFt: 20 });
}

export const useGardenStore = create<GardenStore>((set) => ({
  garden: defaultGarden(),

  updateGarden: (updates) =>
    set((state) => ({ garden: { ...state.garden, ...updates } })),

  loadGarden: (garden) => set({ garden }),

  reset: () => set({ garden: defaultGarden() }),

  setBlueprint: (blueprint) =>
    set((state) => ({ garden: { ...state.garden, blueprint } })),

  addStructure: (opts) =>
    set((state) => ({
      garden: {
        ...state.garden,
        structures: [...state.garden.structures, createStructure(opts)],
      },
    })),

  updateStructure: (id, updates) =>
    set((state) => ({
      garden: {
        ...state.garden,
        structures: state.garden.structures.map((s) =>
          s.id === id ? { ...s, ...updates } : s,
        ),
      },
    })),

  removeStructure: (id) =>
    set((state) => ({
      garden: {
        ...state.garden,
        structures: state.garden.structures.filter((s) => s.id !== id),
      },
    })),

  addZone: (opts) =>
    set((state) => ({
      garden: {
        ...state.garden,
        zones: [...state.garden.zones, createZone(opts)],
      },
    })),

  updateZone: (id, updates) =>
    set((state) => ({
      garden: {
        ...state.garden,
        zones: state.garden.zones.map((z) =>
          z.id === id ? { ...z, ...updates } : z,
        ),
      },
    })),

  removeZone: (id) =>
    set((state) => ({
      garden: {
        ...state.garden,
        zones: state.garden.zones.filter((z) => z.id !== id),
        plantings: state.garden.plantings.filter((p) => p.zoneId !== id),
      },
    })),

  addPlanting: (opts) =>
    set((state) => ({
      garden: {
        ...state.garden,
        plantings: [...state.garden.plantings, createPlanting(opts)],
      },
    })),

  updatePlanting: (id, updates) =>
    set((state) => ({
      garden: {
        ...state.garden,
        plantings: state.garden.plantings.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      },
    })),

  removePlanting: (id) =>
    set((state) => ({
      garden: {
        ...state.garden,
        plantings: state.garden.plantings.filter((p) => p.id !== id),
      },
    })),
}));
```

- [ ] **Step 4: Run garden store tests**

Run: `npm test`

Expected: All garden store tests pass.

- [ ] **Step 5: Write UI store tests**

Create `src/store/uiStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('initializes with defaults', () => {
    const state = useUiStore.getState();
    expect(state.activeLayer).toBe('structures');
    expect(state.selectedIds).toEqual([]);
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it('sets active layer', () => {
    useUiStore.getState().setActiveLayer('zones');
    expect(useUiStore.getState().activeLayer).toBe('zones');
  });

  it('manages selection', () => {
    const { select, addToSelection, clearSelection } = useUiStore.getState();
    select('obj-1');
    expect(useUiStore.getState().selectedIds).toEqual(['obj-1']);

    addToSelection('obj-2');
    expect(useUiStore.getState().selectedIds).toEqual(['obj-1', 'obj-2']);

    clearSelection();
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('manages zoom', () => {
    useUiStore.getState().setZoom(2);
    expect(useUiStore.getState().zoom).toBe(2);
  });

  it('clamps zoom to bounds', () => {
    useUiStore.getState().setZoom(0.01);
    expect(useUiStore.getState().zoom).toBe(0.1);
    useUiStore.getState().setZoom(100);
    expect(useUiStore.getState().zoom).toBe(10);
  });

  it('manages pan', () => {
    useUiStore.getState().setPan(50, 100);
    expect(useUiStore.getState().panX).toBe(50);
    expect(useUiStore.getState().panY).toBe(100);
  });

  it('manages layer visibility', () => {
    useUiStore.getState().setLayerVisible('structures', false);
    expect(useUiStore.getState().layerVisibility.structures).toBe(false);
    expect(useUiStore.getState().layerVisibility.zones).toBe(true);
  });

  it('manages layer opacity', () => {
    useUiStore.getState().setLayerOpacity('zones', 0.5);
    expect(useUiStore.getState().layerOpacity.zones).toBe(0.5);
  });

  it('manages layer lock', () => {
    useUiStore.getState().setLayerLocked('plantings', true);
    expect(useUiStore.getState().layerLocked.plantings).toBe(true);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 7: Implement UI store**

Create `src/store/uiStore.ts`:

```ts
import { create } from 'zustand';
import type { LayerId } from '../model/types';

type LayerRecord<T> = Record<LayerId, T>;

interface DragState {
  isDragging: boolean;
  dragType: 'palette' | 'move' | 'resize' | null;
  dragObjectType: string | null;
  dragStartX: number;
  dragStartY: number;
  dragCurrentX: number;
  dragCurrentY: number;
}

interface UiStore {
  // Layer state
  activeLayer: LayerId;
  layerVisibility: LayerRecord<boolean>;
  layerOpacity: LayerRecord<number>;
  layerLocked: LayerRecord<boolean>;

  // Selection
  selectedIds: string[];

  // Viewport
  zoom: number;
  panX: number;
  panY: number;

  // Drag
  drag: DragState;

  // Actions
  setActiveLayer: (layer: LayerId) => void;
  setLayerVisible: (layer: LayerId, visible: boolean) => void;
  setLayerOpacity: (layer: LayerId, opacity: number) => void;
  setLayerLocked: (layer: LayerId, locked: boolean) => void;

  select: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;

  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;

  setDrag: (drag: Partial<DragState>) => void;
  clearDrag: () => void;

  reset: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function defaultLayerRecord<T>(value: T): LayerRecord<T> {
  return {
    ground: value,
    blueprint: value,
    structures: value,
    zones: value,
    plantings: value,
  };
}

const defaultDrag: DragState = {
  isDragging: false,
  dragType: null,
  dragObjectType: null,
  dragStartX: 0,
  dragStartY: 0,
  dragCurrentX: 0,
  dragCurrentY: 0,
};

export const useUiStore = create<UiStore>((set) => ({
  activeLayer: 'structures',
  layerVisibility: defaultLayerRecord(true),
  layerOpacity: defaultLayerRecord(1),
  layerLocked: defaultLayerRecord(false),
  selectedIds: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: { ...defaultDrag },

  setActiveLayer: (layer) => set({ activeLayer: layer }),

  setLayerVisible: (layer, visible) =>
    set((state) => ({
      layerVisibility: { ...state.layerVisibility, [layer]: visible },
    })),

  setLayerOpacity: (layer, opacity) =>
    set((state) => ({
      layerOpacity: { ...state.layerOpacity, [layer]: opacity },
    })),

  setLayerLocked: (layer, locked) =>
    set((state) => ({
      layerLocked: { ...state.layerLocked, [layer]: locked },
    })),

  select: (id) => set({ selectedIds: [id] }),
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),

  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  setDrag: (drag) =>
    set((state) => ({ drag: { ...state.drag, ...drag } })),
  clearDrag: () => set({ drag: { ...defaultDrag } }),

  reset: () =>
    set({
      activeLayer: 'structures',
      layerVisibility: defaultLayerRecord(true),
      layerOpacity: defaultLayerRecord(1),
      layerLocked: defaultLayerRecord(false),
      selectedIds: [],
      zoom: 1,
      panX: 0,
      panY: 0,
      drag: { ...defaultDrag },
    }),
}));
```

- [ ] **Step 8: Run all tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand garden and UI stores"
```

---

### Task 5: App Shell Layout

**Files:**
- Create: `src/components/App.tsx`, `src/components/MenuBar.tsx`, `src/components/StatusBar.tsx`, `src/styles/App.module.css`, `src/styles/MenuBar.module.css`, `src/styles/StatusBar.module.css`

- [ ] **Step 1: Create App layout CSS**

Create `src/styles/App.module.css`:

```css
.layout {
  display: grid;
  grid-template-rows: var(--menu-height) 1fr var(--status-height);
  grid-template-columns: var(--panel-width) 1fr var(--panel-width);
  grid-template-areas:
    "menu    menu    menu"
    "palette canvas  sidebar"
    "status  status  status";
  height: 100%;
  width: 100%;
}

.menu { grid-area: menu; }
.palette { grid-area: palette; }
.canvas { grid-area: canvas; position: relative; overflow: hidden; }
.sidebar { grid-area: sidebar; }
.status { grid-area: status; }
```

- [ ] **Step 2: Create MenuBar component**

Create `src/styles/MenuBar.module.css`:

```css
.menuBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--color-soil);
  color: var(--color-cream);
  font-size: 14px;
  font-weight: 600;
  user-select: none;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menus {
  display: flex;
  gap: 16px;
  font-weight: 400;
  font-size: 13px;
}

.menus span {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--border-radius);
}

.menus span:hover {
  background: rgba(255, 255, 255, 0.15);
}
```

Create `src/components/MenuBar.tsx`:

```tsx
import styles from '../styles/MenuBar.module.css';

export function MenuBar() {
  return (
    <div className={styles.menuBar}>
      <div className={styles.title}>Garden Planner</div>
      <div className={styles.menus}>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create StatusBar component**

Create `src/styles/StatusBar.module.css`:

```css
.statusBar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  background: var(--color-panel);
  border-top: 1px solid var(--color-panel-border);
  font-size: 12px;
  color: var(--color-text-muted);
  user-select: none;
}
```

Create `src/components/StatusBar.tsx`:

```tsx
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { formatMeasurement } from '../utils/units';
import styles from '../styles/StatusBar.module.css';

export function StatusBar() {
  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const gridLabel = formatMeasurement(garden.gridCellSizeFt, garden.displayUnit, 0);
  const zoomPct = Math.round(zoom * 100);
  const selectionLabel =
    selectedIds.length === 0
      ? 'No selection'
      : selectedIds.length === 1
        ? '1 object selected'
        : `${selectedIds.length} objects selected`;

  return (
    <div className={styles.statusBar}>
      <span>Grid: {gridLabel}</span>
      <span>Zoom: {zoomPct}%</span>
      <span>{selectionLabel}</span>
    </div>
  );
}
```

- [ ] **Step 4: Wire up App with placeholder panels**

Update `src/components/App.tsx`:

```tsx
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import styles from '../styles/App.module.css';

export function App() {
  return (
    <div className={styles.layout}>
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>Palette</div>
      <div className={styles.canvas}>Canvas</div>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify layout in browser**

Run: `npm run dev`

Expected: Four-panel layout renders — menu bar at top with dark brown background, "Palette" on left, "Canvas" in center, "Sidebar" on right, status bar at bottom showing "Grid: 1 ft · Zoom: 100% · No selection". Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/ src/styles/
git commit -m "feat: add app shell layout with menu bar and status bar"
```

---

### Task 6: Canvas Infrastructure and Grid Rendering

**Files:**
- Create: `src/canvas/useCanvasSize.ts`, `src/canvas/renderGrid.ts`, `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Create useCanvasSize hook**

Create `src/canvas/useCanvasSize.ts`:

```ts
import { useEffect, useState, useCallback, type RefObject } from 'react';

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function useCanvasSize(containerRef: RefObject<HTMLDivElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSize({
      width: rect.width,
      height: rect.height,
      dpr: window.devicePixelRatio || 1,
    });
  }, [containerRef]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [measure, containerRef]);

  return size;
}
```

- [ ] **Step 2: Create grid renderer**

Create `src/canvas/renderGrid.ts`:

```ts
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

interface GridOptions {
  widthFt: number;
  heightFt: number;
  cellSizeFt: number;
  view: ViewTransform;
  canvasWidth: number;
  canvasHeight: number;
}

export function renderGrid(ctx: CanvasRenderingContext2D, opts: GridOptions): void {
  const { widthFt, heightFt, cellSizeFt, view, canvasWidth, canvasHeight } = opts;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw garden background
  const [originX, originY] = worldToScreen(0, 0, view);
  const gardenW = widthFt * view.zoom;
  const gardenH = heightFt * view.zoom;

  ctx.fillStyle = '#F5EDE0';
  ctx.fillRect(originX, originY, gardenW, gardenH);

  // Draw grid lines
  ctx.strokeStyle = '#D4C4A8';
  ctx.lineWidth = 1;

  const cellPx = cellSizeFt * view.zoom;

  // Vertical lines
  for (let x = 0; x <= widthFt; x += cellSizeFt) {
    const [sx, sy] = worldToScreen(x, 0, view);
    const [, ey] = worldToScreen(x, heightFt, view);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
    ctx.lineTo(Math.round(sx) + 0.5, Math.round(ey) + 0.5);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= heightFt; y += cellSizeFt) {
    const [sx, sy] = worldToScreen(0, y, view);
    const [ex] = worldToScreen(widthFt, y, view);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
    ctx.lineTo(Math.round(ex) + 0.5, Math.round(sy) + 0.5);
    ctx.stroke();
  }

  // Garden border
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, gardenW, gardenH);
}
```

- [ ] **Step 3: Create CanvasStack component**

Create `src/canvas/CanvasStack.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import { useCanvasSize } from './useCanvasSize';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { renderGrid } from './renderGrid';

export function CanvasStack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);

  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);

  // Render grid layer
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    renderGrid(ctx, {
      widthFt: garden.widthFt,
      heightFt: garden.heightFt,
      cellSizeFt: garden.gridCellSizeFt,
      view: { panX, panY, zoom },
      canvasWidth: width,
      canvasHeight: height,
    });
  }, [garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY, width, height, dpr]);

  const canvasStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: `${width}px`,
    height: `${height}px`,
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#E8E0D0' }}>
      <canvas ref={gridCanvasRef} style={canvasStyle} />
    </div>
  );
}
```

- [ ] **Step 4: Wire CanvasStack into App**

Update `src/components/App.tsx`:

```tsx
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { CanvasStack } from '../canvas/CanvasStack';
import styles from '../styles/App.module.css';

export function App() {
  return (
    <div className={styles.layout}>
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>Palette</div>
      <div className={styles.canvas}>
        <CanvasStack />
      </div>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify grid renders in browser**

Run: `npm run dev`

Expected: 20×20 grid renders in the center panel with light grid lines, a tan background, and a darker border. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/
git commit -m "feat: add canvas infrastructure with grid rendering"
```

---

### Task 7: Pan and Zoom

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Add mouse event handlers for pan and zoom**

Add to `src/canvas/CanvasStack.tsx`, inside the `CanvasStack` component, before the `return`:

```tsx
  const setPan = useUiStore((s) => s.setPan);
  const setZoom = useUiStore((s) => s.setZoom);

  // Right-click drag to pan
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button === 2) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: useUiStore.getState().panX,
        panY: useUiStore.getState().panY,
      };
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan(panStart.current.panX + dx, panStart.current.panY + dy);
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button === 2) {
      isPanning.current = false;
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const currentZoom = useUiStore.getState().zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = currentZoom * delta;

    // Zoom toward mouse position
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const currentPanX = useUiStore.getState().panX;
    const currentPanY = useUiStore.getState().panY;

    const worldX = (mouseX - currentPanX) / currentZoom;
    const worldY = (mouseY - currentPanY) / currentZoom;

    const clampedZoom = Math.min(10, Math.max(0.1, newZoom));
    const newPanX = mouseX - worldX * clampedZoom;
    const newPanY = mouseY - worldY * clampedZoom;

    setZoom(clampedZoom);
    setPan(newPanX, newPanY);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
  }
```

Add event handlers to the container `<div>`:

```tsx
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', background: '#E8E0D0' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <canvas ref={gridCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
    </div>
  );
```

- [ ] **Step 2: Verify pan and zoom in browser**

Run: `npm run dev`

Expected: Right-click drag pans the grid. Scroll wheel zooms in and out, centered on the mouse position. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "feat: add pan (right-click drag) and zoom (scroll wheel)"
```

---

### Task 8: Structure and Zone Rendering

**Files:**
- Create: `src/canvas/renderStructures.ts`, `src/canvas/renderZones.ts`, `src/canvas/renderPlantings.ts`
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Create structure renderer**

Create `src/canvas/renderStructures.ts`:

```ts
import type { Structure } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderStructures(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalAlpha = opacity;

  const sorted = [...structures].sort((a, b) => a.zIndex - b.zIndex);

  for (const s of sorted) {
    const [sx, sy] = worldToScreen(s.x, s.y, view);
    const w = s.width * view.zoom;
    const h = s.height * view.zoom;

    ctx.fillStyle = s.color;
    ctx.fillRect(sx, sy, w, h);

    ctx.strokeStyle = '#3A2E22';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, w, h);

    // Label
    if (s.label) {
      ctx.fillStyle = '#3A2E22';
      ctx.font = `${Math.max(10, 12 * view.zoom)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, sx + w / 2, sy + h / 2, w - 8);
    }
  }

  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: Create zone renderer**

Create `src/canvas/renderZones.ts`:

```ts
import type { Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalAlpha = opacity;

  const sorted = [...zones].sort((a, b) => a.zIndex - b.zIndex);

  for (const z of sorted) {
    const [sx, sy] = worldToScreen(z.x, z.y, view);
    const w = z.width * view.zoom;
    const h = z.height * view.zoom;

    // Semi-transparent fill
    ctx.fillStyle = z.color;
    ctx.fillRect(sx, sy, w, h);

    // Dashed border to distinguish from structures
    ctx.strokeStyle = '#4A7C59';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx, sy, w, h);
    ctx.setLineDash([]);

    // Label
    if (z.label) {
      ctx.fillStyle = '#2D5A27';
      ctx.font = `${Math.max(10, 11 * view.zoom)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(z.label, sx + w / 2, sy + h / 2, w - 8);
    }
  }

  ctx.globalAlpha = 1;
}
```

- [ ] **Step 3: Create planting renderer**

Create `src/canvas/renderPlantings.ts`:

```ts
import type { Planting, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

export function renderPlantings(
  ctx: CanvasRenderingContext2D,
  plantings: Planting[],
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalAlpha = opacity;

  const zoneMap = new Map(zones.map((z) => [z.id, z]));

  for (const p of plantings) {
    const zone = zoneMap.get(p.zoneId);
    if (!zone) continue;

    // Planting position is relative to zone origin
    const worldX = zone.x + p.x;
    const worldY = zone.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);

    const radius = Math.max(4, 8 * view.zoom);

    // Draw circle
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#2D5A27';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw name label below
    if (view.zoom >= 0.5) {
      ctx.fillStyle = '#3A2E22';
      ctx.font = `${Math.max(8, 10 * view.zoom)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name, sx, sy + radius + 2);
    }
  }

  ctx.globalAlpha = 1;
}
```

- [ ] **Step 4: Add structure, zone, and planting canvases to CanvasStack**

In `src/canvas/CanvasStack.tsx`, add refs and render effects for each new layer:

Add imports:

```ts
import { renderStructures } from './renderStructures';
import { renderZones } from './renderZones';
import { renderPlantings } from './renderPlantings';
```

Add refs:

```ts
const structureCanvasRef = useRef<HTMLCanvasElement>(null);
const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
const plantingCanvasRef = useRef<HTMLCanvasElement>(null);
```

Add store selectors:

```ts
const layerVisibility = useUiStore((s) => s.layerVisibility);
const layerOpacity = useUiStore((s) => s.layerOpacity);
```

Add render effects for structures:

```tsx
useEffect(() => {
  const canvas = structureCanvasRef.current;
  if (!canvas || width === 0) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  if (layerVisibility.structures) {
    renderStructures(ctx, garden.structures, { panX, panY, zoom }, width, height, layerOpacity.structures);
  }
}, [garden.structures, zoom, panX, panY, width, height, dpr, layerVisibility.structures, layerOpacity.structures]);
```

Add render effects for zones:

```tsx
useEffect(() => {
  const canvas = zoneCanvasRef.current;
  if (!canvas || width === 0) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  if (layerVisibility.zones) {
    renderZones(ctx, garden.zones, { panX, panY, zoom }, width, height, layerOpacity.zones);
  }
}, [garden.zones, zoom, panX, panY, width, height, dpr, layerVisibility.zones, layerOpacity.zones]);
```

Add render effects for plantings:

```tsx
useEffect(() => {
  const canvas = plantingCanvasRef.current;
  if (!canvas || width === 0) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  if (layerVisibility.plantings) {
    renderPlantings(ctx, garden.plantings, garden.zones, { panX, panY, zoom }, width, height, layerOpacity.plantings);
  }
}, [garden.plantings, garden.zones, zoom, panX, panY, width, height, dpr, layerVisibility.plantings, layerOpacity.plantings]);
```

Add canvas elements to JSX (in order, after the grid canvas):

```tsx
<canvas ref={structureCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
<canvas ref={zoneCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
<canvas ref={plantingCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
```

- [ ] **Step 5: Verify rendering with test data**

Temporarily add to `src/canvas/CanvasStack.tsx` in a `useEffect` that runs once:

```ts
useEffect(() => {
  const { addStructure, addZone, addPlanting } = useGardenStore.getState();
  addStructure({ type: 'raised-bed', x: 2, y: 2, width: 4, height: 8 });
  addZone({ x: 2, y: 2, width: 4, height: 8 });
  const zoneId = useGardenStore.getState().garden.zones[0].id;
  addPlanting({ zoneId, x: 1, y: 1, name: 'Tomato' });
  addPlanting({ zoneId, x: 2, y: 3, name: 'Basil' });
}, []);
```

Run: `npm run dev`

Expected: A raised bed (brown rectangle), a zone (semi-transparent green overlay with dashed border), and two planting circles with labels render on the grid. **Remove the test useEffect after verifying.** Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/
git commit -m "feat: add structure, zone, and planting renderers"
```

---

### Task 9: Object Palette

**Files:**
- Create: `src/components/palette/paletteData.ts`, `src/components/palette/PaletteItem.tsx`, `src/components/palette/ObjectPalette.tsx`, `src/styles/ObjectPalette.module.css`, `src/styles/PaletteItem.module.css`
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Create palette data catalog**

Create `src/components/palette/paletteData.ts`:

```ts
export interface PaletteEntry {
  id: string;
  name: string;
  category: 'structures' | 'zones' | 'plantings';
  type: string;
  defaultWidth: number;
  defaultHeight: number;
  color: string;
}

export const paletteItems: PaletteEntry[] = [
  // Structures
  { id: 'raised-bed', name: 'Raised Bed', category: 'structures', type: 'raised-bed', defaultWidth: 4, defaultHeight: 8, color: '#8B6914' },
  { id: 'pot-small', name: 'Small Pot', category: 'structures', type: 'pot', defaultWidth: 1, defaultHeight: 1, color: '#C75B39' },
  { id: 'pot-large', name: 'Large Pot', category: 'structures', type: 'pot', defaultWidth: 2, defaultHeight: 2, color: '#C75B39' },
  { id: 'fence', name: 'Fence', category: 'structures', type: 'fence', defaultWidth: 8, defaultHeight: 0.5, color: '#5C4033' },
  { id: 'path', name: 'Path', category: 'structures', type: 'path', defaultWidth: 2, defaultHeight: 6, color: '#D4C4A8' },
  { id: 'patio', name: 'Patio', category: 'structures', type: 'patio', defaultWidth: 8, defaultHeight: 8, color: '#A0926B' },

  // Zones
  { id: 'planting-zone', name: 'Planting Zone', category: 'zones', type: 'zone', defaultWidth: 4, defaultHeight: 4, color: '#7FB06944' },
  { id: 'herb-zone', name: 'Herb Zone', category: 'zones', type: 'zone', defaultWidth: 3, defaultHeight: 3, color: '#4A7C5944' },

  // Plantings
  { id: 'tomato', name: 'Tomato', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#E05555' },
  { id: 'basil', name: 'Basil', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#4A7C59' },
  { id: 'pepper', name: 'Pepper', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#E07B3C' },
  { id: 'lettuce', name: 'Lettuce', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#7FB069' },
  { id: 'carrot', name: 'Carrot', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#E0943C' },
  { id: 'cucumber', name: 'Cucumber', category: 'plantings', type: 'planting', defaultWidth: 0, defaultHeight: 0, color: '#2D7A27' },
];

export const categories = [
  { id: 'structures', label: 'Structures' },
  { id: 'zones', label: 'Zones' },
  { id: 'plantings', label: 'Plantings' },
] as const;
```

- [ ] **Step 2: Create PaletteItem component**

Create `src/styles/PaletteItem.module.css`:

```css
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--border-radius);
  cursor: grab;
  user-select: none;
  font-size: 13px;
}

.item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.item:active {
  cursor: grabbing;
}

.swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}
```

Create `src/components/palette/PaletteItem.tsx`:

```tsx
import type { PaletteEntry } from './paletteData';
import styles from '../../styles/PaletteItem.module.css';

interface Props {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
}

export function PaletteItem({ entry, onDragStart }: Props) {
  return (
    <div
      className={styles.item}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
    >
      <div className={styles.swatch} style={{ backgroundColor: entry.color }} />
      <span>{entry.name}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create ObjectPalette component**

Create `src/styles/ObjectPalette.module.css`:

```css
.palette {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-panel);
  border-right: 1px solid var(--color-panel-border);
  overflow-y: auto;
}

.search {
  padding: 8px;
  position: sticky;
  top: 0;
  background: var(--color-panel);
  z-index: 1;
}

.searchInput {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-panel-border);
  border-radius: var(--border-radius);
  background: var(--color-cream);
  font-size: 13px;
  color: var(--color-text);
  outline: none;
}

.searchInput:focus {
  border-color: var(--color-leaf);
}

.category {
  padding: 0 8px 8px;
}

.categoryLabel {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  padding: 8px 8px 4px;
}
```

Create `src/components/palette/ObjectPalette.tsx`:

```tsx
import { useState } from 'react';
import { paletteItems, categories, type PaletteEntry } from './paletteData';
import { PaletteItem } from './PaletteItem';
import styles from '../../styles/ObjectPalette.module.css';

interface Props {
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
}

export function ObjectPalette({ onDragStart }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? paletteItems.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()),
      )
    : paletteItems;

  return (
    <div className={styles.palette}>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search objects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {categories.map((cat) => {
        const items = filtered.filter((item) => item.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id} className={styles.category}>
            <div className={styles.categoryLabel}>{cat.label}</div>
            {items.map((item) => (
              <PaletteItem key={item.id} entry={item} onDragStart={onDragStart} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Wire ObjectPalette into App**

Update `src/components/App.tsx`:

```tsx
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { CanvasStack } from '../canvas/CanvasStack';
import { ObjectPalette } from './palette/ObjectPalette';
import type { PaletteEntry } from './palette/paletteData';
import styles from '../styles/App.module.css';

export function App() {
  function handlePaletteDragStart(entry: PaletteEntry, e: React.DragEvent) {
    e.dataTransfer.setData('application/garden-object', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className={styles.layout}>
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>
        <ObjectPalette onDragStart={handlePaletteDragStart} />
      </div>
      <div className={styles.canvas}>
        <CanvasStack />
      </div>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify palette in browser**

Run: `npm run dev`

Expected: Left panel shows categorized objects (Structures, Zones, Plantings) with colored swatches. Search filters items. Items are draggable. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/palette/ src/styles/ObjectPalette.module.css src/styles/PaletteItem.module.css src/components/App.tsx
git commit -m "feat: add object palette with drag support"
```

---

### Task 10: Drag-and-Drop from Palette to Canvas

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Add drop handlers to CanvasStack**

In `src/canvas/CanvasStack.tsx`, add imports:

```ts
import { useGardenStore } from '../store/gardenStore';
import { screenToWorld } from '../utils/grid';
import { snapToGrid } from '../utils/grid';
import type { PaletteEntry } from '../components/palette/paletteData';
```

Add drop handlers inside the component:

```tsx
  const addStructure = useGardenStore((s) => s.addStructure);
  const addZone = useGardenStore((s) => s.addZone);
  const addPlanting = useGardenStore((s) => s.addPlanting);
  const gridCellSizeFt = garden.gridCellSizeFt;

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/garden-object')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/garden-object');
    if (!data) return;

    const entry: PaletteEntry = JSON.parse(data);
    const rect = containerRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const currentZoom = useUiStore.getState().zoom;
    const currentPanX = useUiStore.getState().panX;
    const currentPanY = useUiStore.getState().panY;
    const [worldX, worldY] = screenToWorld(screenX, screenY, {
      panX: currentPanX,
      panY: currentPanY,
      zoom: currentZoom,
    });

    const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, gridCellSizeFt);
    const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, gridCellSizeFt);

    if (entry.category === 'structures') {
      addStructure({
        type: entry.type,
        x: snappedX,
        y: snappedY,
        width: entry.defaultWidth,
        height: entry.defaultHeight,
      });
    } else if (entry.category === 'zones') {
      addZone({
        x: snappedX,
        y: snappedY,
        width: entry.defaultWidth,
        height: entry.defaultHeight,
      });
    } else if (entry.category === 'plantings') {
      // Find zone under the drop point
      const zones = useGardenStore.getState().garden.zones;
      const targetZone = zones.find(
        (z) => worldX >= z.x && worldX <= z.x + z.width && worldY >= z.y && worldY <= z.y + z.height,
      );
      if (targetZone) {
        addPlanting({
          zoneId: targetZone.id,
          x: snapToGrid(worldX - targetZone.x, gridCellSizeFt),
          y: snapToGrid(worldY - targetZone.y, gridCellSizeFt),
          name: entry.name,
        });
      }
    }
  }
```

Add `onDragOver` and `onDrop` to the container `<div>`:

```tsx
  <div
    ref={containerRef}
    style={{ width: '100%', height: '100%', position: 'relative', background: '#E8E0D0' }}
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onWheel={handleWheel}
    onContextMenu={handleContextMenu}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
```

- [ ] **Step 2: Verify drag-and-drop in browser**

Run: `npm run dev`

Expected: Drag a "Raised Bed" from the palette onto the canvas — a brown rectangle appears snapped to the grid. Drag a "Planting Zone" — a green transparent overlay appears. Drag a "Tomato" onto a zone — a green circle with label appears. Dragging a planting outside a zone does nothing. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "feat: add drag-and-drop from palette to canvas"
```

---

### Task 11: Hit Testing and Object Selection

**Files:**
- Create: `src/canvas/hitTest.ts`
- Test: `src/canvas/hitTest.test.ts`
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Write hit test tests**

Create `src/canvas/hitTest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hitTestObjects } from './hitTest';
import type { Structure, Zone } from '../model/types';

describe('hitTestObjects', () => {
  const structures: Structure[] = [
    { id: 's1', type: 'raised-bed', x: 2, y: 2, width: 4, height: 4, rotation: 0, color: '#8B6914', label: '', zIndex: 0, parentId: null, snapToGrid: true },
  ];

  const zones: Zone[] = [
    { id: 'z1', x: 10, y: 10, width: 3, height: 3, color: '#7FB06944', label: '', zIndex: 0, parentId: null, soilType: null, sunExposure: null },
  ];

  it('returns structure when point is inside', () => {
    const hit = hitTestObjects(3, 3, structures, zones, 'structures');
    expect(hit?.id).toBe('s1');
  });

  it('returns null when point is outside all objects', () => {
    const hit = hitTestObjects(20, 20, structures, zones, 'structures');
    expect(hit).toBeNull();
  });

  it('returns zone when testing zone layer', () => {
    const hit = hitTestObjects(11, 11, structures, zones, 'zones');
    expect(hit?.id).toBe('z1');
  });

  it('returns null when clicking structure area but testing zone layer', () => {
    const hit = hitTestObjects(3, 3, structures, zones, 'zones');
    expect(hit).toBeNull();
  });

  it('returns topmost object by zIndex', () => {
    const twoStructures: Structure[] = [
      { ...structures[0], id: 'bottom', zIndex: 0 },
      { ...structures[0], id: 'top', zIndex: 1, x: 3, y: 3, width: 4, height: 4 },
    ];
    const hit = hitTestObjects(4, 4, twoStructures, [], 'structures');
    expect(hit?.id).toBe('top');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement hit testing**

Create `src/canvas/hitTest.ts`:

```ts
import type { Structure, Zone, LayerId } from '../model/types';

interface HitResult {
  id: string;
  layer: LayerId;
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

export function hitTestObjects(
  worldX: number,
  worldY: number,
  structures: Structure[],
  zones: Zone[],
  activeLayer: LayerId,
): HitResult | null {
  if (activeLayer === 'structures') {
    const sorted = [...structures].sort((a, b) => b.zIndex - a.zIndex);
    for (const s of sorted) {
      if (pointInRect(worldX, worldY, s.x, s.y, s.width, s.height)) {
        return { id: s.id, layer: 'structures' };
      }
    }
  }

  if (activeLayer === 'zones') {
    const sorted = [...zones].sort((a, b) => b.zIndex - a.zIndex);
    for (const z of sorted) {
      if (pointInRect(worldX, worldY, z.x, z.y, z.width, z.height)) {
        return { id: z.id, layer: 'zones' };
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run hit test tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 5: Add click-to-select to CanvasStack**

In `src/canvas/CanvasStack.tsx`, import the hit test:

```ts
import { hitTestObjects } from './hitTest';
```

Update `handleMouseDown` to handle left-click selection:

```tsx
  const select = useUiStore((s) => s.select);
  const addToSelection = useUiStore((s) => s.addToSelection);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const activeLayer = useUiStore((s) => s.activeLayer);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button === 2) {
      // Right-click: pan
      e.preventDefault();
      isPanning.current = true;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: useUiStore.getState().panX,
        panY: useUiStore.getState().panY,
      };
      return;
    }

    if (e.button === 0) {
      // Left-click: select
      const rect = containerRef.current!.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const [worldX, worldY] = screenToWorld(screenX, screenY, {
        panX: useUiStore.getState().panX,
        panY: useUiStore.getState().panY,
        zoom: useUiStore.getState().zoom,
      });

      const hit = hitTestObjects(
        worldX,
        worldY,
        useGardenStore.getState().garden.structures,
        useGardenStore.getState().garden.zones,
        useUiStore.getState().activeLayer,
      );

      if (hit) {
        if (e.shiftKey) {
          addToSelection(hit.id);
        } else {
          select(hit.id);
        }
      } else {
        clearSelection();
      }
    }
  }
```

- [ ] **Step 6: Verify selection in browser**

Run: `npm run dev`

Expected: Drop some objects on the canvas. Click on one — status bar updates to "1 object selected". Shift+click another — "2 objects selected". Click empty space — "No selection". Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/hitTest.ts src/canvas/hitTest.test.ts src/canvas/CanvasStack.tsx
git commit -m "feat: add hit testing and click-to-select"
```

---

### Task 12: Selection Rendering

**Files:**
- Create: `src/canvas/renderSelection.ts`
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Create selection renderer**

Create `src/canvas/renderSelection.ts`:

```ts
import type { Structure, Zone } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

interface SelectableObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selectedIds: string[],
  structures: Structure[],
  zones: Zone[],
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (selectedIds.length === 0) return;

  const allObjects: SelectableObject[] = [
    ...structures,
    ...zones,
  ];

  const selected = allObjects.filter((obj) => selectedIds.includes(obj.id));

  for (const obj of selected) {
    const [sx, sy] = worldToScreen(obj.x, obj.y, view);
    const w = obj.width * view.zoom;
    const h = obj.height * view.zoom;

    // Selection outline
    ctx.strokeStyle = '#5BA4CF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(sx - 1, sy - 1, w + 2, h + 2);
    ctx.setLineDash([]);

    // Resize handles
    const handleSize = 8;
    const handles = [
      [sx - handleSize / 2, sy - handleSize / 2],                       // top-left
      [sx + w / 2 - handleSize / 2, sy - handleSize / 2],               // top-center
      [sx + w - handleSize / 2, sy - handleSize / 2],                   // top-right
      [sx + w - handleSize / 2, sy + h / 2 - handleSize / 2],           // middle-right
      [sx + w - handleSize / 2, sy + h - handleSize / 2],               // bottom-right
      [sx + w / 2 - handleSize / 2, sy + h - handleSize / 2],           // bottom-center
      [sx - handleSize / 2, sy + h - handleSize / 2],                   // bottom-left
      [sx - handleSize / 2, sy + h / 2 - handleSize / 2],               // middle-left
    ];

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#5BA4CF';
    ctx.lineWidth = 2;
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx, hy, handleSize, handleSize);
      ctx.strokeRect(hx, hy, handleSize, handleSize);
    }
  }
}
```

- [ ] **Step 2: Add selection canvas to CanvasStack**

In `src/canvas/CanvasStack.tsx`, add import:

```ts
import { renderSelection } from './renderSelection';
```

Add ref:

```ts
const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
```

Add store selector:

```ts
const selectedIds = useUiStore((s) => s.selectedIds);
```

Add render effect:

```tsx
useEffect(() => {
  const canvas = selectionCanvasRef.current;
  if (!canvas || width === 0) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  renderSelection(ctx, selectedIds, garden.structures, garden.zones, { panX, panY, zoom }, width, height);
}, [selectedIds, garden.structures, garden.zones, zoom, panX, panY, width, height, dpr]);
```

Add canvas element (last, on top of all other canvases):

```tsx
<canvas ref={selectionCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
```

- [ ] **Step 3: Verify selection rendering in browser**

Run: `npm run dev`

Expected: Click an object — blue dashed outline with white square resize handles appears around it. Click away — outline disappears. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/renderSelection.ts src/canvas/CanvasStack.tsx
git commit -m "feat: add selection outline and resize handles rendering"
```

---

### Task 13: Object Moving

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`

- [ ] **Step 1: Add drag-to-move logic**

In `src/canvas/CanvasStack.tsx`, add a ref to track whether we're moving an object:

```ts
const isMoving = useRef(false);
const moveStart = useRef({ worldX: 0, worldY: 0, objX: 0, objY: 0 });
const moveObjectId = useRef<string | null>(null);
const moveObjectLayer = useRef<string | null>(null);
```

Update `handleMouseDown` for left-click — after the hit test, if an object is hit and already selected, start a move:

```tsx
    if (hit) {
      if (e.shiftKey) {
        addToSelection(hit.id);
      } else {
        select(hit.id);
      }

      // Start move
      const obj = hit.layer === 'structures'
        ? useGardenStore.getState().garden.structures.find((s) => s.id === hit.id)
        : useGardenStore.getState().garden.zones.find((z) => z.id === hit.id);

      if (obj) {
        isMoving.current = true;
        moveObjectId.current = hit.id;
        moveObjectLayer.current = hit.layer;
        moveStart.current = { worldX, worldY, objX: obj.x, objY: obj.y };
      }
    }
```

Update `handleMouseMove` to move objects:

```tsx
  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan(panStart.current.panX + dx, panStart.current.panY + dy);
      return;
    }

    if (isMoving.current && moveObjectId.current) {
      const rect = containerRef.current!.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const [worldX, worldY] = screenToWorld(screenX, screenY, {
        panX: useUiStore.getState().panX,
        panY: useUiStore.getState().panY,
        zoom: useUiStore.getState().zoom,
      });

      const dx = worldX - moveStart.current.worldX;
      const dy = worldY - moveStart.current.worldY;
      let newX = moveStart.current.objX + dx;
      let newY = moveStart.current.objY + dy;

      if (!e.altKey) {
        const cellSize = useGardenStore.getState().garden.gridCellSizeFt;
        newX = snapToGrid(newX, cellSize);
        newY = snapToGrid(newY, cellSize);
      }

      if (moveObjectLayer.current === 'structures') {
        useGardenStore.getState().updateStructure(moveObjectId.current, { x: newX, y: newY });
      } else if (moveObjectLayer.current === 'zones') {
        useGardenStore.getState().updateZone(moveObjectId.current, { x: newX, y: newY });
      }
    }
  }
```

Update `handleMouseUp`:

```tsx
  function handleMouseUp(e: React.MouseEvent) {
    if (e.button === 2) {
      isPanning.current = false;
    }
    if (e.button === 0) {
      isMoving.current = false;
      moveObjectId.current = null;
      moveObjectLayer.current = null;
    }
  }
```

- [ ] **Step 2: Verify object moving in browser**

Run: `npm run dev`

Expected: Click an object, then drag it — it moves with the mouse, snapping to the grid. Hold Alt/Option while dragging — it moves freely without snapping. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "feat: add click-and-drag to move objects with grid snap"
```

---

### Task 14: Layer Panel

**Files:**
- Create: `src/components/sidebar/LayerPanel.tsx`, `src/styles/LayerPanel.module.css`

- [ ] **Step 1: Create LayerPanel CSS**

Create `src/styles/LayerPanel.module.css`:

```css
.panel {
  padding: 8px;
}

.title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  padding: 4px 8px;
  margin-bottom: 4px;
}

.layer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--border-radius);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.layer:hover {
  background: rgba(0, 0, 0, 0.04);
}

.active {
  background: rgba(74, 124, 89, 0.12);
  font-weight: 600;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.iconButton {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  border-radius: 3px;
}

.iconButton:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.06);
}

.opacitySlider {
  width: 60px;
  height: 4px;
  accent-color: var(--color-leaf);
}
```

- [ ] **Step 2: Create LayerPanel component**

Create `src/components/sidebar/LayerPanel.tsx`:

```tsx
import { useUiStore } from '../../store/uiStore';
import type { LayerId } from '../../model/types';
import styles from '../../styles/LayerPanel.module.css';

const layers: { id: LayerId; label: string }[] = [
  { id: 'plantings', label: 'Plantings' },
  { id: 'zones', label: 'Zones' },
  { id: 'structures', label: 'Structures' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'ground', label: 'Ground' },
];

export function LayerPanel() {
  const activeLayer = useUiStore((s) => s.activeLayer);
  const visibility = useUiStore((s) => s.layerVisibility);
  const opacity = useUiStore((s) => s.layerOpacity);
  const locked = useUiStore((s) => s.layerLocked);
  const setActiveLayer = useUiStore((s) => s.setActiveLayer);
  const setLayerVisible = useUiStore((s) => s.setLayerVisible);
  const setLayerOpacity = useUiStore((s) => s.setLayerOpacity);
  const setLayerLocked = useUiStore((s) => s.setLayerLocked);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Layers</div>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`${styles.layer} ${activeLayer === layer.id ? styles.active : ''}`}
          onClick={() => setActiveLayer(layer.id)}
        >
          <span>{layer.label}</span>
          <div className={styles.controls}>
            <input
              className={styles.opacitySlider}
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={opacity[layer.id]}
              onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className={styles.iconButton}
              title={visibility[layer.id] ? 'Hide' : 'Show'}
              onClick={(e) => {
                e.stopPropagation();
                setLayerVisible(layer.id, !visibility[layer.id]);
              }}
            >
              {visibility[layer.id] ? '👁' : '👁‍🗨'}
            </button>
            <button
              className={styles.iconButton}
              title={locked[layer.id] ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation();
                setLayerLocked(layer.id, !locked[layer.id]);
              }}
            >
              {locked[layer.id] ? '🔒' : '🔓'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/ src/styles/LayerPanel.module.css
git commit -m "feat: add layer panel with visibility, opacity, and lock controls"
```

---

### Task 15: Properties Panel

**Files:**
- Create: `src/components/sidebar/PropertiesPanel.tsx`, `src/components/sidebar/Sidebar.tsx`, `src/styles/PropertiesPanel.module.css`, `src/styles/Sidebar.module.css`
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Create Sidebar and Properties CSS**

Create `src/styles/Sidebar.module.css`:

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-panel);
  border-left: 1px solid var(--color-panel-border);
  overflow-y: auto;
}

.divider {
  height: 1px;
  background: var(--color-panel-border);
  margin: 4px 0;
}
```

Create `src/styles/PropertiesPanel.module.css`:

```css
.panel {
  padding: 8px;
}

.title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  padding: 4px 8px;
  margin-bottom: 4px;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  font-size: 13px;
}

.fieldLabel {
  width: 60px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.fieldInput {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--color-panel-border);
  border-radius: 4px;
  background: var(--color-cream);
  font-size: 12px;
  color: var(--color-text);
  min-width: 0;
}

.fieldInput:focus {
  outline: none;
  border-color: var(--color-leaf);
}

.colorInput {
  width: 32px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--color-panel-border);
  border-radius: 4px;
  cursor: pointer;
}

.row {
  display: flex;
  gap: 4px;
}

.row .field {
  flex: 1;
  padding: 3px 0 3px 8px;
}
```

- [ ] **Step 2: Create PropertiesPanel component**

Create `src/components/sidebar/PropertiesPanel.tsx`:

```tsx
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { feetToDisplay, displayToFeet } from '../../utils/units';
import styles from '../../styles/PropertiesPanel.module.css';

export function PropertiesPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateGarden = useGardenStore((s) => s.updateGarden);
  const updateStructure = useGardenStore((s) => s.updateStructure);
  const updateZone = useGardenStore((s) => s.updateZone);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const unit = garden.displayUnit;

  // Find selected object
  const selectedId = selectedIds[0] ?? null;
  const selectedStructure = garden.structures.find((s) => s.id === selectedId);
  const selectedZone = garden.zones.find((z) => z.id === selectedId);
  const selected = selectedStructure ?? selectedZone;

  if (!selected) {
    // Garden settings
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Garden Settings</div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.fieldInput}
            value={garden.name}
            onChange={(e) => updateGarden({ name: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Width</span>
            <input
              className={styles.fieldInput}
              type="number"
              value={feetToDisplay(garden.widthFt, unit).toFixed(1)}
              onChange={(e) => updateGarden({ widthFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Height</span>
            <input
              className={styles.fieldInput}
              type="number"
              value={feetToDisplay(garden.heightFt, unit).toFixed(1)}
              onChange={(e) => updateGarden({ heightFt: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Grid</span>
          <input
            className={styles.fieldInput}
            type="number"
            value={feetToDisplay(garden.gridCellSizeFt, unit).toFixed(1)}
            onChange={(e) => updateGarden({ gridCellSizeFt: displayToFeet(parseFloat(e.target.value) || 1, unit) })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Units</span>
          <select
            className={styles.fieldInput}
            value={garden.displayUnit}
            onChange={(e) => updateGarden({ displayUnit: e.target.value as any })}
          >
            <option value="ft">Feet</option>
            <option value="in">Inches</option>
            <option value="m">Meters</option>
            <option value="cm">Centimeters</option>
          </select>
        </div>
      </div>
    );
  }

  const update = selectedStructure
    ? (updates: Record<string, any>) => updateStructure(selected.id, updates)
    : (updates: Record<string, any>) => updateZone(selected.id, updates);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>
        {selectedStructure ? 'Structure' : 'Zone'} Properties
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Label</span>
        <input
          className={styles.fieldInput}
          value={selected.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>X</span>
          <input
            className={styles.fieldInput}
            type="number"
            value={feetToDisplay(selected.x, unit).toFixed(1)}
            onChange={(e) => update({ x: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Y</span>
          <input
            className={styles.fieldInput}
            type="number"
            value={feetToDisplay(selected.y, unit).toFixed(1)}
            onChange={(e) => update({ y: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />
        </div>
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Width</span>
          <input
            className={styles.fieldInput}
            type="number"
            value={feetToDisplay(selected.width, unit).toFixed(1)}
            onChange={(e) => update({ width: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Height</span>
          <input
            className={styles.fieldInput}
            type="number"
            value={feetToDisplay(selected.height, unit).toFixed(1)}
            onChange={(e) => update({ height: displayToFeet(parseFloat(e.target.value) || 0, unit) })}
          />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <input
          className={styles.colorInput}
          type="color"
          value={selected.color.substring(0, 7)}
          onChange={(e) => update({ color: e.target.value })}
        />
      </div>
      {selectedStructure && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            className={styles.fieldInput}
            value={selectedStructure.type}
            onChange={(e) => update({ type: e.target.value })}
          >
            <option value="raised-bed">Raised Bed</option>
            <option value="pot">Pot</option>
            <option value="fence">Fence</option>
            <option value="path">Path</option>
            <option value="patio">Patio</option>
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Sidebar component**

Create `src/components/sidebar/Sidebar.tsx`:

```tsx
import { PropertiesPanel } from './PropertiesPanel';
import { LayerPanel } from './LayerPanel';
import styles from '../../styles/Sidebar.module.css';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPanel />
    </div>
  );
}
```

- [ ] **Step 4: Wire Sidebar into App**

Update `src/components/App.tsx`, replacing the placeholder sidebar:

```tsx
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { CanvasStack } from '../canvas/CanvasStack';
import { ObjectPalette } from './palette/ObjectPalette';
import { Sidebar } from './sidebar/Sidebar';
import type { PaletteEntry } from './palette/paletteData';
import styles from '../styles/App.module.css';

export function App() {
  function handlePaletteDragStart(entry: PaletteEntry, e: React.DragEvent) {
    e.dataTransfer.setData('application/garden-object', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className={styles.layout}>
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>
        <ObjectPalette onDragStart={handlePaletteDragStart} />
      </div>
      <div className={styles.canvas}>
        <CanvasStack />
      </div>
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify sidebar in browser**

Run: `npm run dev`

Expected: Right sidebar shows "Garden Settings" with name, width, height, grid size, and unit dropdown. Changing values updates the canvas (e.g., change width — grid resizes). Select an object — panel switches to show object properties. Layers section shows all five layers with visibility, opacity, and lock controls. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar/ src/styles/PropertiesPanel.module.css src/styles/Sidebar.module.css src/components/App.tsx
git commit -m "feat: add properties panel and sidebar with garden/object editing"
```

---

### Task 16: File Save and Load

**Files:**
- Create: `src/utils/file.ts`
- Test: `src/utils/file.test.ts`
- Modify: `src/components/MenuBar.tsx`

- [ ] **Step 1: Write file utility tests**

Create `src/utils/file.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeGarden, deserializeGarden } from './file';
import { createGarden } from '../model/types';

describe('serializeGarden', () => {
  it('serializes to JSON string', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
    const json = serializeGarden(garden);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Test');
    expect(parsed.version).toBe(1);
  });
});

describe('deserializeGarden', () => {
  it('deserializes valid JSON', () => {
    const garden = createGarden({ name: 'Test', widthFt: 20, heightFt: 15 });
    const json = serializeGarden(garden);
    const result = deserializeGarden(json);
    expect(result.name).toBe('Test');
    expect(result.widthFt).toBe(20);
  });

  it('throws on invalid JSON', () => {
    expect(() => deserializeGarden('not json')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => deserializeGarden(JSON.stringify({ name: 'test' }))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement file utilities**

Create `src/utils/file.ts`:

```ts
import type { Garden } from '../model/types';

export function serializeGarden(garden: Garden): string {
  return JSON.stringify(garden, null, 2);
}

export function deserializeGarden(json: string): Garden {
  const data = JSON.parse(json);
  if (!data.version || !data.name || data.widthFt == null || data.heightFt == null) {
    throw new Error('Invalid garden file: missing required fields');
  }
  return data as Garden;
}

export function downloadGarden(garden: Garden): void {
  const json = serializeGarden(garden);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${garden.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.garden`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openGardenFile(): Promise<Garden> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.garden,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(deserializeGarden(reader.result as string));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}

const AUTOSAVE_KEY = 'garden-planner-autosave';

export function autosave(garden: Garden): void {
  localStorage.setItem(AUTOSAVE_KEY, serializeGarden(garden));
}

export function loadAutosave(): Garden | null {
  const json = localStorage.getItem(AUTOSAVE_KEY);
  if (!json) return null;
  try {
    return deserializeGarden(json);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run file utility tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 5: Wire save/load into MenuBar**

Update `src/components/MenuBar.tsx`:

```tsx
import { useGardenStore } from '../store/gardenStore';
import { downloadGarden, openGardenFile } from '../utils/file';
import styles from '../styles/MenuBar.module.css';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);

  async function handleOpen() {
    try {
      const loaded = await openGardenFile();
      loadGarden(loaded);
    } catch {
      // User cancelled or invalid file
    }
  }

  function handleSave() {
    downloadGarden(garden);
  }

  function handleNew() {
    reset();
  }

  return (
    <div className={styles.menuBar}>
      <div className={styles.title}>Garden Planner</div>
      <div className={styles.menus}>
        <span onClick={handleNew}>New</span>
        <span onClick={handleOpen}>Open</span>
        <span onClick={handleSave}>Save</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add autosave to App**

In `src/components/App.tsx`, add an autosave effect:

```tsx
import { useEffect } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { autosave, loadAutosave } from '../utils/file';
```

Inside the `App` component:

```tsx
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);

  // Load autosave on mount
  useEffect(() => {
    const saved = loadAutosave();
    if (saved) loadGarden(saved);
  }, [loadGarden]);

  // Autosave on every change
  useEffect(() => {
    autosave(garden);
  }, [garden]);
```

- [ ] **Step 7: Verify save/load in browser**

Run: `npm run dev`

Expected: Place some objects. Click "Save" — downloads a `.garden` file. Click "New" — clears the canvas. Click "Open" — load the saved file, objects reappear. Refresh the page — autosaved state persists. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/utils/file.ts src/utils/file.test.ts src/components/MenuBar.tsx src/components/App.tsx
git commit -m "feat: add file save/load and localStorage autosave"
```

---

### Task 17: Blueprint Layer

**Files:**
- Create: `src/canvas/renderBlueprint.ts`
- Modify: `src/canvas/CanvasStack.tsx`, `src/components/sidebar/PropertiesPanel.tsx`

- [ ] **Step 1: Create blueprint renderer**

Create `src/canvas/renderBlueprint.ts`:

```ts
import type { Blueprint } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

const imageCache = new Map<string, HTMLImageElement>();

function getImage(dataUri: string): HTMLImageElement | null {
  if (imageCache.has(dataUri)) {
    const img = imageCache.get(dataUri)!;
    return img.complete ? img : null;
  }
  const img = new Image();
  img.src = dataUri;
  imageCache.set(dataUri, img);
  img.onload = () => {
    // Trigger re-render by dispatching a custom event
    window.dispatchEvent(new CustomEvent('blueprint-loaded'));
  };
  return null;
}

export function renderBlueprint(
  ctx: CanvasRenderingContext2D,
  blueprint: Blueprint | null,
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  layerOpacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (!blueprint) return;

  const img = getImage(blueprint.imageData);
  if (!img) return;

  ctx.globalAlpha = blueprint.opacity * layerOpacity;

  const [sx, sy] = worldToScreen(blueprint.x, blueprint.y, view);
  const imgW = (img.naturalWidth / 96) * blueprint.scale * view.zoom;
  const imgH = (img.naturalHeight / 96) * blueprint.scale * view.zoom;

  ctx.drawImage(img, sx, sy, imgW, imgH);
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: Add blueprint canvas to CanvasStack**

In `src/canvas/CanvasStack.tsx`, add import:

```ts
import { renderBlueprint } from './renderBlueprint';
```

Add ref:

```ts
const blueprintCanvasRef = useRef<HTMLCanvasElement>(null);
```

Add render effect:

```tsx
useEffect(() => {
  const canvas = blueprintCanvasRef.current;
  if (!canvas || width === 0) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  if (layerVisibility.blueprint) {
    renderBlueprint(ctx, garden.blueprint, { panX, panY, zoom }, width, height, layerOpacity.blueprint);
  }
}, [garden.blueprint, zoom, panX, panY, width, height, dpr, layerVisibility.blueprint, layerOpacity.blueprint]);

// Re-render when blueprint image loads
useEffect(() => {
  const handler = () => {
    const canvas = blueprintCanvasRef.current;
    if (!canvas || width === 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const g = useGardenStore.getState().garden;
    const ui = useUiStore.getState();
    if (ui.layerVisibility.blueprint) {
      renderBlueprint(ctx, g.blueprint, { panX: ui.panX, panY: ui.panY, zoom: ui.zoom }, width, height, ui.layerOpacity.blueprint);
    }
  };
  window.addEventListener('blueprint-loaded', handler);
  return () => window.removeEventListener('blueprint-loaded', handler);
}, [width, height, dpr]);
```

Add the blueprint canvas element after the grid canvas and before the structure canvas:

```tsx
<canvas ref={blueprintCanvasRef} style={{ ...canvasStyle, pointerEvents: 'none' }} />
```

- [ ] **Step 3: Add blueprint controls to PropertiesPanel**

In `src/components/sidebar/PropertiesPanel.tsx`, add a blueprint section to the garden settings view (inside the `if (!selected)` branch, after the Units field):

```tsx
      <div className={styles.title} style={{ marginTop: 12 }}>Blueprint</div>
      {garden.blueprint ? (
        <>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Opacity</span>
            <input
              className={styles.fieldInput}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={garden.blueprint.opacity}
              onChange={(e) => setBlueprint({ ...garden.blueprint!, opacity: parseFloat(e.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Scale</span>
            <input
              className={styles.fieldInput}
              type="number"
              step="0.1"
              value={garden.blueprint.scale.toFixed(1)}
              onChange={(e) => setBlueprint({ ...garden.blueprint!, scale: parseFloat(e.target.value) || 1 })}
            />
          </div>
          <div className={styles.field}>
            <button
              className={styles.fieldInput}
              style={{ cursor: 'pointer', textAlign: 'center' }}
              onClick={() => setBlueprint(null)}
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <div className={styles.field}>
          <button
            className={styles.fieldInput}
            style={{ cursor: 'pointer', textAlign: 'center' }}
            onClick={handleLoadBlueprint}
          >
            Load Image...
          </button>
        </div>
      )}
```

Add the `setBlueprint` action and load handler:

```tsx
  const setBlueprint = useGardenStore((s) => s.setBlueprint);

  function handleLoadBlueprint() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setBlueprint({
          imageData: reader.result as string,
          x: 0,
          y: 0,
          scale: 1,
          opacity: 0.3,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
```

- [ ] **Step 4: Verify blueprint in browser**

Run: `npm run dev`

Expected: In garden settings, click "Load Image..." — file picker opens. Select an image — it renders semi-transparently behind the grid objects. Opacity and scale sliders adjust the image. "Remove" button clears it. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/renderBlueprint.ts src/canvas/CanvasStack.tsx src/components/sidebar/PropertiesPanel.tsx
git commit -m "feat: add blueprint layer with image loading, opacity, and scale"
```

---

### Task 18: Delete Objects and Final Polish

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`, `src/components/sidebar/PropertiesPanel.tsx`

- [ ] **Step 1: Add delete key handler**

In `src/canvas/CanvasStack.tsx`, add a keyboard event listener for Delete/Backspace:

```tsx
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;

        const ids = useUiStore.getState().selectedIds;
        const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();

        for (const id of ids) {
          if (garden.structures.find((s) => s.id === id)) removeStructure(id);
          else if (garden.zones.find((z) => z.id === id)) removeZone(id);
          else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
        }

        useUiStore.getState().clearSelection();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
```

- [ ] **Step 2: Add delete button to PropertiesPanel**

In `src/components/sidebar/PropertiesPanel.tsx`, at the bottom of the object properties view (inside the `selected` branch), add:

```tsx
      <div className={styles.field} style={{ marginTop: 8 }}>
        <button
          className={styles.fieldInput}
          style={{ cursor: 'pointer', textAlign: 'center', color: 'var(--color-terracotta)' }}
          onClick={() => {
            if (selectedStructure) {
              useGardenStore.getState().removeStructure(selected.id);
            } else {
              useGardenStore.getState().removeZone(selected.id);
            }
            useUiStore.getState().clearSelection();
          }}
        >
          Delete
        </button>
      </div>
```

Add missing import for `useGardenStore`:

```ts
import { useGardenStore } from '../../store/gardenStore';
```

(This import should already be present from earlier steps.)

- [ ] **Step 3: Verify deletion in browser**

Run: `npm run dev`

Expected: Select an object, press Delete/Backspace — it's removed. Or click "Delete" button in properties panel — same result. Stop the dev server.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/CanvasStack.tsx src/components/sidebar/PropertiesPanel.tsx
git commit -m "feat: add object deletion via keyboard and properties panel"
```

---

### Task 19: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Build completes without errors or TypeScript errors.

- [ ] **Step 3: Full manual smoke test**

Run: `npm run dev`

Verify:
1. Grid renders at 20×20 with earthy color palette
2. Pan with right-click drag
3. Zoom with scroll wheel
4. Drag raised bed from palette onto canvas — snaps to grid
5. Drag planting zone onto canvas
6. Drag tomato onto zone — circle appears with label
7. Click to select — blue outline with handles
8. Drag to move — snaps to grid
9. Alt+drag — freeform movement
10. Shift+click — multi-select
11. Properties panel updates when object selected
12. Edit label, position, size, color in properties — canvas updates
13. Layer visibility toggles — hide/show layers
14. Layer opacity slider — adjusts transparency
15. Save — downloads `.garden` file
16. New — clears canvas
17. Open — loads saved file
18. Refresh page — autosaved state persists
19. Load blueprint image — renders behind objects
20. Delete key — removes selected object

Stop the dev server.

- [ ] **Step 4: Commit any final fixes**

If any issues were found and fixed, commit them:

```bash
git add -A
git commit -m "fix: address issues from final verification"
```

- [ ] **Step 5: Delete smoke test**

Remove `src/smoke.test.ts` (no longer needed):

```bash
git rm src/smoke.test.ts
git commit -m "chore: remove initial smoke test"
```
