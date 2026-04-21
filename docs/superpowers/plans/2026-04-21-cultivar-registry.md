# Cultivar Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract plant-type data into a static `Cultivar` registry; simplify `Planting` to reference cultivars by ID.

**Architecture:** A new `src/model/cultivars.ts` module holds the static cultivar definitions and lookup functions. The `Planting` interface shrinks to just placement + `cultivarId`. All rendering and palette code resolves cultivar data at point-of-use.

**Tech Stack:** TypeScript, Vitest, Zustand

---

### Task 1: Create the Cultivar registry module

**Files:**
- Create: `src/model/cultivars.ts`
- Create: `src/model/cultivars.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/model/cultivars.test.ts
import { describe, expect, it } from 'vitest';
import { getCultivar, getAllCultivars } from './cultivars';

describe('cultivar registry', () => {
  it('getAllCultivars returns all entries', () => {
    const all = getAllCultivars();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('name');
    expect(all[0]).toHaveProperty('taxonomicName');
    expect(all[0]).toHaveProperty('color');
    expect(all[0]).toHaveProperty('footprintFt');
    expect(all[0]).toHaveProperty('spacingFt');
  });

  it('getCultivar returns a known cultivar by id', () => {
    const tomato = getCultivar('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.name).toBe('Tomato');
    expect(tomato!.taxonomicName).toBe('Solanum lycopersicum');
  });

  it('getCultivar returns undefined for unknown id', () => {
    expect(getCultivar('nonexistent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/model/cultivars.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Write implementation**

```ts
// src/model/cultivars.ts
export interface Cultivar {
  id: string;
  name: string;
  taxonomicName: string;
  variety: string | null;
  color: string;
  footprintFt: number;
  spacingFt: number;
}

const cultivars: Cultivar[] = [
  { id: 'tomato', name: 'Tomato', taxonomicName: 'Solanum lycopersicum', variety: null, color: '#E05555', footprintFt: 1, spacingFt: 2 },
  { id: 'basil', name: 'Basil', taxonomicName: 'Ocimum basilicum', variety: null, color: '#4A7C59', footprintFt: 0.75, spacingFt: 0.5 },
  { id: 'pepper', name: 'Pepper', taxonomicName: 'Capsicum annuum', variety: null, color: '#E07B3C', footprintFt: 1, spacingFt: 1.5 },
  { id: 'lettuce', name: 'Lettuce', taxonomicName: 'Lactuca sativa', variety: null, color: '#7FB069', footprintFt: 0.75, spacingFt: 0.75 },
  { id: 'carrot', name: 'Carrot', taxonomicName: 'Daucus carota', variety: null, color: '#E0943C', footprintFt: 0.5, spacingFt: 0.25 },
  { id: 'cucumber', name: 'Cucumber', taxonomicName: 'Cucumis sativus', variety: null, color: '#2D7A27', footprintFt: 1, spacingFt: 1.5 },
];

const cultivarMap = new Map<string, Cultivar>(cultivars.map((c) => [c.id, c]));

export function getCultivar(id: string): Cultivar | undefined {
  return cultivarMap.get(id);
}

export function getAllCultivars(): Cultivar[] {
  return cultivars;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/model/cultivars.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/model/cultivars.ts src/model/cultivars.test.ts
git commit -m "feat: add static cultivar registry"
```

---

### Task 2: Update Planting interface and createPlanting

**Files:**
- Modify: `src/model/types.ts` (lines 63-75 for interface, lines 184-202 for createPlanting)
- Modify: `src/store/gardenStore.ts` (line 35 — addPlanting opts type)

- [ ] **Step 1: Update the Planting interface**

In `src/model/types.ts`, replace the `Planting` interface:

```ts
export interface Planting {
  id: string;
  parentId: string;
  cultivarId: string;
  x: number;
  y: number;
  label: string;
  icon: string | null;
}
```

- [ ] **Step 2: Update createPlanting**

In `src/model/types.ts`, replace the `createPlanting` function:

```ts
export function createPlanting(opts: {
  parentId: string;
  x: number;
  y: number;
  cultivarId: string;
}): Planting {
  const cultivar = getCultivar(opts.cultivarId);
  return {
    id: generateId(),
    parentId: opts.parentId,
    cultivarId: opts.cultivarId,
    x: opts.x,
    y: opts.y,
    label: cultivar?.name ?? opts.cultivarId,
    icon: null,
  };
}
```

Add import at top of `src/model/types.ts`:

```ts
import { getCultivar } from './cultivars';
```

- [ ] **Step 3: Update gardenStore addPlanting opts type**

In `src/store/gardenStore.ts`, change the `addPlanting` signature (line 35):

```ts
addPlanting: (opts: { parentId: string; x: number; y: number; cultivarId: string }) => void;
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors in tests and consumers still referencing old fields — this is expected, we fix them in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/model/types.ts src/store/gardenStore.ts
git commit -m "refactor: simplify Planting interface to use cultivarId"
```

---

### Task 3: Update plantRenderers to dispatch on cultivar ID

**Files:**
- Modify: `src/canvas/plantRenderers.ts` (lines 124-139)

- [ ] **Step 1: Change renderer map keys from name to cultivar ID**

In `src/canvas/plantRenderers.ts`, replace the `renderers` map and `renderPlant` function:

```ts
const renderers: Record<string, PlantRenderer> = {
  basil: renderBasil,
  tomato: renderTomato,
  pepper: renderPepper,
  lettuce: renderLettuce,
};

export function renderPlant(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
): void {
  const renderer = renderers[cultivarId] ?? renderGeneric;
  renderer(ctx, radius, color);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/plantRenderers.ts
git commit -m "refactor: plantRenderers dispatch on cultivarId"
```

---

### Task 4: Update renderPlantings to resolve cultivar data

**Files:**
- Modify: `src/canvas/renderPlantings.ts` (lines 62-73)

- [ ] **Step 1: Add cultivar import and resolve in render loop**

Add import at top of `src/canvas/renderPlantings.ts`:

```ts
import { getCultivar } from '../model/cultivars';
```

Replace the planting render loop body (the section that computes radius and calls renderPlant):

```ts
  for (const p of plantings) {
    const parent = parentMap.get(p.parentId);
    if (!parent) continue;
    const cultivar = getCultivar(p.cultivarId);
    const color = cultivar?.color ?? '#4A7C59';
    const footprint = cultivar?.footprintFt ?? 0.5;

    const worldX = parent.x + p.x;
    const worldY = parent.y + p.y;
    const [sx, sy] = worldToScreen(worldX, worldY, view);
    const radius = Math.max(3, (footprint / 2) * view.zoom);

    ctx.save();
    ctx.translate(sx, sy);
    renderPlant(ctx, p.cultivarId, radius, color);
    ctx.restore();
```

- [ ] **Step 2: Update label text resolution**

In the same file, update the label text line to use cultivar name:

```ts
    const labelText = p.label || cultivar?.name || p.cultivarId;
```

- [ ] **Step 3: Commit**

```bash
git add src/canvas/renderPlantings.ts
git commit -m "refactor: renderPlantings resolves cultivar for color/footprint"
```

---

### Task 5: Update palette data and PaletteItem

**Files:**
- Modify: `src/components/palette/paletteData.ts` (lines 104-158)
- Modify: `src/components/palette/PaletteItem.tsx` (line 28, PlantIcon)

- [ ] **Step 1: Derive planting palette entries from cultivar registry**

In `src/components/palette/paletteData.ts`, replace the hardcoded planting entries with:

```ts
import { getAllCultivars } from '../../model/cultivars';
```

Then replace the `// Plantings` section of the `paletteItems` array:

```ts
  // Plantings
  ...getAllCultivars().map((c) => ({
    id: c.id,
    name: c.name,
    category: 'plantings' as const,
    type: 'planting',
    defaultWidth: 0,
    defaultHeight: 0,
    color: c.color,
  })),
```

- [ ] **Step 2: Update PlantIcon to pass cultivar ID**

In `src/components/palette/PaletteItem.tsx`, the `PlantIcon` component currently receives `name` and passes it to `renderPlant`. Since the palette entry `id` is the cultivar ID for plantings, update the render call:

Change the `PlantIcon` usage (around line 65):

```tsx
      {entry.category === 'plantings' ? (
        <PlantIcon name={entry.id} color={entry.color} />
      ) : (
```

And in the `PlantIcon` component, rename for clarity but the key change is already done — `entry.id` is the cultivar ID which matches the new renderer keys.

- [ ] **Step 3: Commit**

```bash
git add src/components/palette/paletteData.ts src/components/palette/PaletteItem.tsx
git commit -m "refactor: palette derives planting entries from cultivar registry"
```

---

### Task 6: Update CanvasStack drop handler

**Files:**
- Modify: `src/canvas/CanvasStack.tsx` (line 540)

- [ ] **Step 1: Pass cultivarId instead of name in addPlanting call**

In `src/canvas/CanvasStack.tsx`, find the `addPlanting` call in the drop handler (around line 536) and change:

```ts
          addPlanting({
            parentId: parent.id,
            x: pos.x,
            y: pos.y,
            cultivarId: entry.id,
          });
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/CanvasStack.tsx
git commit -m "refactor: drop handler passes cultivarId to addPlanting"
```

---

### Task 7: Update default.garden

**Files:**
- Modify: `public/default.garden`

- [ ] **Step 1: Replace planting fields with cultivarId**

Update each planting in `public/default.garden`. Replace the current planting objects with:

```json
    {
      "id": "default-planting-tomato",
      "parentId": "default-pot-1",
      "cultivarId": "tomato",
      "x": 1,
      "y": 1,
      "label": "Tomato",
      "icon": null
    },
    {
      "id": "default-planting-1",
      "parentId": "default-pot-3",
      "cultivarId": "basil",
      "x": 0.5,
      "y": 0.5,
      "label": "Basil",
      "icon": null
    },
    {
      "id": "default-planting-2",
      "parentId": "default-pot-4",
      "cultivarId": "basil",
      "x": 0.5,
      "y": 0.5,
      "label": "Basil",
      "icon": null
    },
    {
      "id": "default-planting-3",
      "parentId": "default-pot-5",
      "cultivarId": "basil",
      "x": 0.5,
      "y": 0.5,
      "label": "Basil",
      "icon": null
    }
```

- [ ] **Step 2: Commit**

```bash
git add public/default.garden
git commit -m "chore: update default.garden to use cultivarId"
```

---

### Task 8: Update tests

**Files:**
- Modify: `src/store/gardenStore.test.ts`
- Modify: `src/store/layerLock.test.ts`
- Modify: `src/store/commitUpdate.test.ts`

- [ ] **Step 1: Update gardenStore.test.ts**

Replace all `addPlanting({ parentId: ..., x: ..., y: ..., name: 'Tomato' })` calls with `addPlanting({ parentId: ..., x: ..., y: ..., cultivarId: 'tomato' })`.

Replace all `name: 'Basil'` with `cultivarId: 'basil'`.

- [ ] **Step 2: Update layerLock.test.ts**

Same change — replace `name: 'Tomato'` with `cultivarId: 'tomato'` in `addPlanting` calls (lines 77 and 84).

- [ ] **Step 3: Update commitUpdate.test.ts**

Same change — replace `name: 'Tomato'` with `cultivarId: 'tomato'` in `addPlanting` call (line 52).

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.test.ts src/store/layerLock.test.ts src/store/commitUpdate.test.ts
git commit -m "test: update planting tests to use cultivarId"
```

---

### Task 9: Update deserialization and type check

**Files:**
- Modify: `src/utils/file.ts` (if planting deserialization validates fields)

- [ ] **Step 1: Check file.ts for planting field references**

Run: `grep -n "name\|color\|footprint\|spacing\|variety" src/utils/file.ts`

If `deserializeGarden` validates or transforms planting fields, update to expect `cultivarId` instead of the removed fields.

- [ ] **Step 2: Run full type check and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Zero type errors, all tests pass

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Successful build

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: fix remaining cultivarId migration issues"
```

---

### Task 10: Update behavior docs

**Files:**
- Modify: `docs/behavior.md`

- [ ] **Step 1: Add cultivar section to behavior.md**

Add after the Patterns section:

```markdown
## Cultivars

- Plant types are defined as static `Cultivar` entries in `src/model/cultivars.ts`
- Each planting references a cultivar by ID; display data (color, footprint, name) is resolved at render time
- To add a new plant type: add an entry to the `cultivars` array and optionally a custom renderer in `src/canvas/plantRenderers.ts`
```

- [ ] **Step 2: Commit**

```bash
git add docs/behavior.md
git commit -m "docs: document cultivar registry in behavior.md"
```
