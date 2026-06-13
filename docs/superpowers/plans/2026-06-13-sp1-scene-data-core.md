# SP1 — Scene as the Garden Data Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a weasel `Scene` the source of truth for the **garden** domain (structures/zones/plantings) and its undo/redo, with **zero visible behavior change**; nursery state and its undo stay in the store until SP3.

**Architecture:** A `GardenScene = Scene<GardenNodeData, GardenLayer, GardenPose>` holds structures/zones/plantings as Scene nodes. The store keeps the non-spatial `GardenBase` (id/name/dims/nursery/collection/…) and composes the public `garden` object on demand via `sceneToGarden(scene, base)`, memoized per `scene.getVersion()`. Hundreds of `useGardenStore(s => s.garden.…)` readers and the existing `Canvas`/adapter/`dragPreview` render path are unchanged because `garden` keeps its exact shape. Garden mutations delegate to `scene.add/remove/setPose/update/move` wrapped in `scene.batch` (one undo entry per logical edit). Live cross-time edits (PropertiesPanel typing, rotate animation) use a transient **override layer** flushed to one Scene batch at the next checkpoint/undo/save. Undo is **mode-routed**: garden mode → `scene.undo()`; nursery mode → the retained `history.ts` snapshot stack. A garden **selection ring** restores prior selection on undo (existing tests require it). `.garden` ⇄ Scene conversion happens at `loadGarden`/serialize; the on-disk format and load-time migrations are untouched.

**Tech Stack:** TypeScript, Zustand, weasel (`@orochi235/weasel`, pinned at `~/src/weasel-eric-pin` / `323d0914`), Vitest, Playwright (visual regression), Biome.

**Key decisions already settled (do not re-litigate):**
- Garden and nursery get **separate** undo histories (Mike, 2026-06-13). The pre-SP1 single shared timeline is intentionally dropped. Cmd-Z routes by `appMode`.
- Selection-restore-on-undo for garden is **required** — `gardenStore.test.ts` ("undo restores the selection that was active before the change") and `history.test.ts` ("captures selectedIds … restores them on undo") assert it. Build a selection ring, not just dangling-prune.
- **No pin changes.** The pinned Scene API (`add/remove/setPose/update/move/reorder/batch/undo/redo/canUndo/canRedo/subscribe/getVersion/childrenOf/get/nodes/roots/renderOrder`) is sufficient; signatures match HEAD for every method SP1 uses (HEAD only *adds* journal/history-index methods). Verified.
- **No on-disk format change.** `src/utils/file.ts` `serializeGarden`/`deserializeGarden` and all migrations stay as-is; conversion is wired at `gardenStore.loadGarden` (load) and `serializeGarden(get().garden)` reads the composed garden (save).

**Verification gates (run from `/Users/mike/src/eric`):**
- `npm test` — full Vitest suite (baseline: 758 passing).
- `npm run test:visual` — Playwright visual regression (no pixel change).
- `npm run check:optimizer-boundary` — `src/optimizer/` imports nothing outside itself.
- `npm run build` — `tsc -b && vite build` (typecheck + bundle).
- `npm run lint` — Biome.
- Manual smoke: `npm run dev` (port 53305) — add/move/resize/rotate/delete + undo/redo + save/load, garden and nursery.

**Pre-flight (run once before Task 1):**
- [ ] Confirm branch: `git branch --show-current` → `weasel-action-api-migration`.
- [ ] Confirm pin: `readlink node_modules/@orochi235/weasel` resolves under `~/src/weasel-eric-pin`.
- [ ] Establish baseline: `npm test` prints `Tests  758 passed`. If not, STOP and reconcile before starting.

---

## File Structure

**New files (`src/scene/`):**
- `src/scene/gardenScene.ts` — `GardenLayer`, `GardenPose`, `GardenNodeData`, `GardenScene`, `GardenBase`, `GARDEN_LAYERS`, `GARDEN_HISTORY_LIMIT`, `createGardenScene(initial)`.
- `src/scene/gardenConverters.ts` — `gardenToScene(garden)`, `sceneToGarden(scene, base)`, `splitBase(garden)`.
- `src/scene/gardenScene.test.ts`, `src/scene/gardenConverters.test.ts` — unit + round-trip tests.

**Heavily modified:**
- `src/store/gardenStore.ts` — base+scene state, `garden` composition/memoization, mutation delegation, override/transaction layer, selection ring, mode-routed undo.
- `src/store/history.ts` — retyped to nursery snapshots (`{ nursery, selectedIds }`).
- `src/store/history.test.ts` — updated to the nursery-snapshot signature.

**Modified (adapters → Scene ops):**
- `src/canvas/adapters/structureMove.ts`, `zoneMove.ts`, `plantingMove.ts`, `structureResize.ts`, `zoneResize.ts`, `insert.ts`, `gardenScene.ts` (the kit `SceneAdapter`).

**Unchanged but verified:** `src/utils/file.ts`, `src/components/sidebar/PropertiesPanel.tsx`, `src/actions/objects/rotate.ts` + `animateRotation.ts` (they call store live `update*`, which becomes override-backed — no edit needed), `src/components/optimizer/runOptimizerForBed.ts`, the whole `src/canvas/` render path, `CanvasNewPrototype.tsx`.

---

## Reference: exact current shapes (verified against the repo)

```ts
// src/model/types.ts:81
interface Garden { id:string; version:number; name:string; widthFt:number; lengthFt:number;
  gridCellSizeFt:number; displayUnit:DisplayUnit; groundColor:string; blueprint:Blueprint|null;
  structures:Structure[]; zones:Zone[]; plantings:Planting[]; nursery:NurseryState; collection:Cultivar[]; }
// src/model/types.ts:21
interface Structure { id:string; type:string; shape:StructureShape; x:number; y:number; width:number;
  length:number; rotation:number; color:string; label:string; zIndex:number; parentId:string|null;
  groupId:string|null; snapToGrid:boolean; surface:boolean; container:boolean; fill:FillType|null;
  layout:Layout|null; wallThicknessFt:number; clipChildren:boolean; }
// src/model/types.ts:55
interface Zone { id:string; x:number; y:number; width:number; length:number; color:string; label:string;
  zIndex:number; parentId:string|null; soilType:string|null; sunExposure:string|null; layout:Layout|null; pattern:string|null; }
// src/model/types.ts:71
interface Planting { id:string; parentId:string; cultivarId:string; x:number; y:number; label:string; icon:string|null; }
// src/model/cultivars.ts:30 — Cultivar.footprintFt:number is the planting size source.
```

Pinned Scene API used (all auto-undoable; `batch` coalesces a synchronous group into one entry):
```ts
createScene<TData,TLayer,TPose>({ systemLayers, initial?, historyLimit?, generateId? }): Scene
scene.add(spec: AddNodeSpec): NodeId           // spec: { kind:'leaf'|'container'; layer; pose; data; parent?; index?; id? }
scene.remove(id); scene.setPose(id,pose); scene.update(id,{data}); scene.move(id,parent,index?); scene.reorder(id,index)
scene.batch(label, fn): T                       // one undo entry for everything fn mutates
scene.undo():boolean; scene.redo():boolean; scene.canUndo():boolean; scene.canRedo():boolean
scene.subscribe(fn):()=>void; scene.getVersion():number
scene.get(id):Node|undefined; scene.nodes:ReadonlyMap; scene.roots:readonly NodeId[]; scene.childrenOf(id); scene.renderOrder()
```

---

## Phase A — Scene types + converters (pure, no store wiring)

### Task A1: Garden Scene types + factory

**Files:**
- Create: `src/scene/gardenScene.ts`
- Test: `src/scene/gardenScene.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/gardenScene.test.ts
import { describe, expect, it } from 'vitest';
import { GARDEN_LAYERS, createGardenScene } from './gardenScene';

describe('createGardenScene', () => {
  it('declares the five garden layers in render order', () => {
    expect(GARDEN_LAYERS).toEqual(['ground', 'blueprint', 'structures', 'zones', 'plantings']);
  });

  it('creates an empty scene with no undo history', () => {
    const scene = createGardenScene([]);
    expect(scene.roots).toEqual([]);
    expect(scene.canUndo()).toBe(false);
  });

  it('seeds initial nodes without making them undoable', () => {
    const scene = createGardenScene([
      { kind: 'container', layer: 'structures', pose: { x: 0, y: 0, width: 4, height: 8 },
        data: { kind: 'structure', type: 'raised-bed', color: '#000', label: 'A', zIndex: 0,
          groupId: null, snapToGrid: true, surface: false, container: true, fill: null,
          layout: null, wallThicknessFt: 0.5, clipChildren: false } },
    ]);
    expect(scene.roots).toHaveLength(1);
    expect(scene.canUndo()).toBe(false); // initial nodes are not history entries
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/scene/gardenScene.test.ts`
Expected: FAIL — `Cannot find module './gardenScene'`.

- [ ] **Step 3: Implement `src/scene/gardenScene.ts`**

```ts
import { createScene } from '@orochi235/weasel';
import type { AddNodeSpec, Scene } from '@orochi235/weasel';
import type { FillType, Garden, Layout, StructureShape } from '../model/types';

export type GardenLayer = 'ground' | 'blueprint' | 'structures' | 'zones' | 'plantings';

/** Render order, low→high. Matches the old structures-under-zones-under-plantings stacking. */
export const GARDEN_LAYERS: readonly GardenLayer[] = ['ground', 'blueprint', 'structures', 'zones', 'plantings'];

/** Matches today's MAX_HISTORY in src/store/history.ts. */
export const GARDEN_HISTORY_LIMIT = 100;

/**
 * Rect pose for every garden node. We adopt RectPose field names ({x,y,width,height})
 * so kit move/resize/compose helpers work unmodified; eric's `length` is translated to
 * `height` at the .garden boundary (see gardenConverters). `rotation`/`shape` ride along
 * as opaque extra fields (the kit preserves unknown pose keys).
 */
export interface GardenPose {
  x: number; y: number; width: number; height: number;
  rotation?: number; shape?: StructureShape;
}

/** Domain payload minus geometry. `kind` is eric's discriminator, distinct from the Scene
 * node's structural kind ('leaf' | 'container'). */
export type GardenNodeData =
  | { kind: 'structure'; type: string; color: string; label: string; zIndex: number;
      groupId: string | null; snapToGrid: boolean; surface: boolean; container: boolean;
      fill: FillType | null; layout: Layout | null; wallThicknessFt: number; clipChildren: boolean }
  | { kind: 'zone'; color: string; label: string; zIndex: number; soilType: string | null;
      sunExposure: string | null; layout: Layout | null; pattern: string | null }
  | { kind: 'planting'; cultivarId: string; label: string; icon: string | null };

export type GardenScene = Scene<GardenNodeData, GardenLayer, GardenPose>;
export type GardenAddNodeSpec = AddNodeSpec<GardenNodeData, GardenLayer, GardenPose>;

/** The non-spatial remainder of a Garden — everything the Scene does NOT own. */
export type GardenBase = Omit<Garden, 'structures' | 'zones' | 'plantings'>;

export function createGardenScene(initial: readonly GardenAddNodeSpec[]): GardenScene {
  return createScene<GardenNodeData, GardenLayer, GardenPose>({
    systemLayers: GARDEN_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: GARDEN_HISTORY_LIMIT,
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- src/scene/gardenScene.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/gardenScene.ts src/scene/gardenScene.test.ts
git commit -m "feat(scene): GardenScene types and factory"
```

---

### Task A2: `gardenToScene` converter

**Files:**
- Create: `src/scene/gardenConverters.ts`
- Test: `src/scene/gardenConverters.test.ts`

Rules (from the design doc):
- Structures → Scene `container` when `s.container === true` **OR the structure has child structures/plantings** (a node with children must be a container in weasel); otherwise `leaf`. Layer `structures`. *(Correction discovered during A4: `default.garden` nests pot structures under a `container:false` patio — weasel rejects a `leaf` with children. The Scene structural `kind` is thus distinct from the domain `data.container` flag, which still stores the original value and round-trips unchanged.)*
- Zones → `container`. Layer `zones`.
- Plantings → `leaf`, **parent = its `parentId`** (always set). **Layer = the parent's layer** (`'structures'` or `'zones'`), NOT `'plantings'`. *(Correction discovered during A2: the pinned weasel's `assertSubtreeLayer` (scene.ts:184) requires every child to share its parent's layer, so a nested planting cannot live on a separate `'plantings'` layer. This is invisible in SP1 — the old canvas renders plantings globally on top, not via Scene `renderOrder()`, and `sceneToGarden` derives plantings by `data.kind`, not layer. **SP2 open question:** how to render plantings globally above zones when weasel forces planting-in-structure onto the `'structures'` layer. The `'plantings'`/`'ground'`/`'blueprint'` layers carry no nodes in SP1.)*
- Roots = structures/zones with `parentId == null` (or a structure nested under another structure via `parentId`).
- **Sibling order = ascending `zIndex`** — add siblings in zIndex order so `index` (append) reflects it.
- Pose: structures/zones `{x,y,width,height:length,rotation,shape}`. Plantings `{x,y,width:fp,height:fp}` where `fp = cultivar.footprintFt ?? 0.5` (matches `gardenScene.ts:188`). Planting `x/y` are parent-local already (`plantingPose.ts` proves it) — pass through.
- A structure/zone's `data.zIndex` stays the canonical value; Scene order is derived.

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/gardenConverters.test.ts
import { describe, expect, it } from 'vitest';
import { createGardenScene } from './gardenScene';
import { gardenToScene } from './gardenConverters';
import { createGarden } from '../model/types';
import type { Structure, Zone, Planting } from '../model/types';

function struct(p: Partial<Structure> & Pick<Structure, 'id'>): Structure {
  return { id: p.id, type: 'raised-bed', shape: 'rectangle', x: 0, y: 0, width: 4, length: 8,
    rotation: 0, color: '#aaa', label: '', zIndex: 0, parentId: null, groupId: null, snapToGrid: true,
    surface: false, container: true, fill: null, layout: null, wallThicknessFt: 0.5, clipChildren: false, ...p };
}
function plant(p: Partial<Planting> & Pick<Planting, 'id' | 'parentId'>): Planting {
  return { id: p.id, parentId: p.parentId, cultivarId: 'cabbage.red', x: 1, y: 1, label: '', icon: null, ...p };
}

describe('gardenToScene', () => {
  it('maps a container structure to a Scene container node on the structures layer', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1', length: 8, container: true })];
    const scene = createGardenScene(gardenToScene(g));
    const node = scene.get('s1' as never)!;
    expect(node.kind).toBe('container');
    expect(node.layer).toBe('structures');
    expect(node.pose).toMatchObject({ x: 0, y: 0, width: 4, height: 8 }); // length -> height
    expect(node.parent).toBeNull();
  });

  it('maps a non-container structure (fence) to a leaf', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'f1', type: 'fence', container: false })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.get('f1' as never)!.kind).toBe('leaf');
  });

  it('nests a planting under its parent structure with a derived square pose', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1' })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 2, cultivarId: 'cabbage.red' })];
    const scene = createGardenScene(gardenToScene(g));
    const p = scene.get('p1' as never)!;
    expect(p.kind).toBe('leaf');
    expect(p.layer).toBe('structures'); // inherits parent's layer (weasel assertSubtreeLayer)
    expect(p.parent).toBe('s1');
    expect(p.pose.x).toBe(1);
    expect(p.pose.y).toBe(2);
    expect(p.pose.width).toBeCloseTo(p.pose.height); // square footprint
    expect(p.pose.width).toBeGreaterThan(0);
  });

  it('orders sibling roots by ascending zIndex', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'hi', zIndex: 5 }), struct({ id: 'lo', zIndex: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    expect(scene.roots).toEqual(['lo', 'hi']); // lo (z=1) before hi (z=5)
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/scene/gardenConverters.test.ts`
Expected: FAIL — `gardenToScene` is not exported.

- [ ] **Step 3: Implement `gardenToScene` in `src/scene/gardenConverters.ts`**

```ts
import { asNodeId } from '@orochi235/weasel';
import { getCultivar } from '../model/cultivars';
import type { Garden, Planting, Structure, Zone } from '../model/types';
import type { GardenAddNodeSpec, GardenBase, GardenScene } from './gardenScene';

const DEFAULT_FOOTPRINT_FT = 0.5; // matches gardenScene.ts:188 and file.ts:123

function structurePose(s: Structure) {
  return { x: s.x, y: s.y, width: s.width, height: s.length, rotation: s.rotation, shape: s.shape };
}
function zonePose(z: Zone) {
  return { x: z.x, y: z.y, width: z.width, height: z.length };
}
function plantingPose(p: Planting) {
  const fp = (getCultivar(p.cultivarId)?.footprintFt ?? DEFAULT_FOOTPRINT_FT);
  return { x: p.x, y: p.y, width: fp, height: fp };
}

/**
 * Build initial AddNodeSpecs for a Garden. Parents are emitted before children, and
 * siblings are emitted in ascending zIndex order so append-order reflects render order.
 * Planting x/y are already parent-local (utils/plantingPose.ts), so they pass through.
 */
export function gardenToScene(garden: Garden): GardenAddNodeSpec[] {
  const specs: GardenAddNodeSpec[] = [];

  const structById = new Map(garden.structures.map((s) => [s.id, s]));
  const byZ = <T extends { zIndex: number }>(a: T, b: T) => a.zIndex - b.zIndex;

  // Structures, parents-before-children. A structure may nest under another structure.
  const emittedStruct = new Set<string>();
  const emitStruct = (s: Structure) => {
    if (emittedStruct.has(s.id)) return;
    const parent = s.parentId ? structById.get(s.parentId) : undefined;
    if (parent) emitStruct(parent); // ensure parent emitted first
    specs.push({
      id: asNodeId(s.id),
      kind: s.container ? 'container' : 'leaf',
      layer: 'structures',
      pose: structurePose(s),
      parent: s.parentId ? asNodeId(s.parentId) : null,
      data: { kind: 'structure', type: s.type, color: s.color, label: s.label, zIndex: s.zIndex,
        groupId: s.groupId, snapToGrid: s.snapToGrid, surface: s.surface, container: s.container,
        fill: s.fill, layout: s.layout, wallThicknessFt: s.wallThicknessFt, clipChildren: s.clipChildren },
    });
    emittedStruct.add(s.id);
  };
  for (const s of [...garden.structures].sort(byZ)) emitStruct(s);

  // Zones (containers). parentId may reference another zone.
  const zoneById = new Map(garden.zones.map((z) => [z.id, z]));
  const emittedZone = new Set<string>();
  const emitZone = (z: Zone) => {
    if (emittedZone.has(z.id)) return;
    const parent = z.parentId ? zoneById.get(z.parentId) : undefined;
    if (parent) emitZone(parent);
    specs.push({
      id: asNodeId(z.id),
      kind: 'container',
      layer: 'zones',
      pose: zonePose(z),
      parent: z.parentId ? asNodeId(z.parentId) : null,
      data: { kind: 'zone', color: z.color, label: z.label, zIndex: z.zIndex, soilType: z.soilType,
        sunExposure: z.sunExposure, layout: z.layout, pattern: z.pattern },
    });
    emittedZone.add(z.id);
  };
  for (const z of [...garden.zones].sort(byZ)) emitZone(z);

  // Plantings (leaves), children of their parent. Parent already emitted above.
  // Layer must equal the parent's layer (weasel assertSubtreeLayer) — look it up.
  const layerOf = (id: string): GardenLayer =>
    structById.has(id) ? 'structures' : zoneById.has(id) ? 'zones' : 'structures';
  for (const p of garden.plantings) {
    specs.push({
      id: asNodeId(p.id),
      kind: 'leaf',
      layer: layerOf(p.parentId),
      pose: plantingPose(p),
      parent: asNodeId(p.parentId),
      data: { kind: 'planting', cultivarId: p.cultivarId, label: p.label, icon: p.icon },
    });
  }

  return specs;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- src/scene/gardenConverters.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts
git commit -m "feat(scene): gardenToScene converter"
```

---

### Task A3: `sceneToGarden` converter + `splitBase`

**Files:**
- Modify: `src/scene/gardenConverters.ts`
- Test: `src/scene/gardenConverters.test.ts`

`sceneToGarden(scene, base)` reverses A2: walk `scene.nodes`, rebuild `structures/zones/plantings` arrays (`height→length`; planting pose dropped to `{x,y}`), reattach `base`. `splitBase(garden)` returns the `GardenBase` (everything except the three spatial arrays).

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
import { gardenToScene, sceneToGarden, splitBase } from './gardenConverters';

describe('sceneToGarden round-trip', () => {
  it('round-trips structures, zones, and plantings (modulo derived planting size)', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 's1', x: 1, y: 2, width: 4, length: 8, rotation: 90 })];
    g.plantings = [plant({ id: 'p1', parentId: 's1', x: 1, y: 2 })];
    const scene = createGardenScene(gardenToScene(g));

    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures).toHaveLength(1);
    expect(out.structures[0]).toMatchObject({ id: 's1', x: 1, y: 2, width: 4, length: 8, rotation: 90 });
    expect(out.plantings[0]).toMatchObject({ id: 'p1', parentId: 's1', x: 1, y: 2, cultivarId: 'cabbage.red' });
    // planting carries no width/length on the way out
    expect((out.plantings[0] as Record<string, unknown>).width).toBeUndefined();
    // base reattached
    expect(out.name).toBe('g');
    expect(out.nursery).toBe(g.nursery);
    expect(out.collection).toBe(g.collection);
  });

  it('preserves zIndex ordering on the way back', () => {
    const g = createGarden({ name: 'g', widthFt: 10, lengthFt: 10 });
    g.structures = [struct({ id: 'hi', zIndex: 5 }), struct({ id: 'lo', zIndex: 1 })];
    const scene = createGardenScene(gardenToScene(g));
    const out = sceneToGarden(scene, splitBase(g));
    expect(out.structures.map((s) => s.id).sort()).toEqual(['hi', 'lo']);
    expect(out.structures.find((s) => s.id === 'hi')!.zIndex).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/scene/gardenConverters.test.ts`
Expected: FAIL — `sceneToGarden`/`splitBase` not exported.

- [ ] **Step 3: Implement in `src/scene/gardenConverters.ts`**

```ts
import type { GardenBase, GardenNodeData, GardenPose, GardenScene } from './gardenScene';

export function splitBase(garden: Garden): GardenBase {
  const { structures: _s, zones: _z, plantings: _p, ...base } = garden;
  return base;
}

export function sceneToGarden(scene: GardenScene, base: GardenBase): Garden {
  const structures: Structure[] = [];
  const zones: Zone[] = [];
  const plantings: Planting[] = [];

  for (const node of scene.nodes.values()) {
    const data = node.data as GardenNodeData;
    const pose = node.pose as GardenPose;
    if (data.kind === 'structure') {
      structures.push({
        id: String(node.id), type: data.type, shape: pose.shape ?? 'rectangle',
        x: pose.x, y: pose.y, width: pose.width, length: pose.height, rotation: pose.rotation ?? 0,
        color: data.color, label: data.label, zIndex: data.zIndex,
        parentId: node.parent ? String(node.parent) : null, groupId: data.groupId,
        snapToGrid: data.snapToGrid, surface: data.surface, container: data.container,
        fill: data.fill, layout: data.layout, wallThicknessFt: data.wallThicknessFt, clipChildren: data.clipChildren,
      });
    } else if (data.kind === 'zone') {
      zones.push({
        id: String(node.id), x: pose.x, y: pose.y, width: pose.width, length: pose.height,
        color: data.color, label: data.label, zIndex: data.zIndex,
        parentId: node.parent ? String(node.parent) : null, soilType: data.soilType,
        sunExposure: data.sunExposure, layout: data.layout, pattern: data.pattern,
      });
    } else {
      plantings.push({
        id: String(node.id), parentId: node.parent ? String(node.parent) : '',
        cultivarId: data.cultivarId, x: pose.x, y: pose.y, label: data.label, icon: data.icon,
      });
    }
  }

  return { ...base, structures, zones, plantings };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- src/scene/gardenConverters.test.ts`
Expected: PASS (6 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts
git commit -m "feat(scene): sceneToGarden + splitBase converters"
```

---

### Task A4: Fixture round-trip parity

**Files:**
- Test: `src/scene/gardenConverters.test.ts` (append)

Verify `sceneToGarden(createGardenScene(gardenToScene(g)), splitBase(g))` reproduces the real sample gardens, comparing structures/zones/plantings ignoring (a) the derived planting width/length and (b) array order (Scene rebuilds order from layers/zIndex).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeGarden } from '../utils/file';

const FIXTURES = ['default', 'marinara', 'salsa', 'eight-tomatoes', 'trellis-bed'];

function sortById<T extends { id: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.id.localeCompare(b.id));
}

describe('gardenToScene/sceneToGarden fixture parity', () => {
  for (const name of FIXTURES) {
    it(`round-trips public/${name}.garden`, () => {
      const json = readFileSync(join(process.cwd(), 'public', `${name}.garden`), 'utf8');
      const g = deserializeGarden(json);
      const out = sceneToGarden(createGardenScene(gardenToScene(g)), splitBase(g));

      expect(sortById(out.structures)).toEqual(sortById(g.structures));
      expect(sortById(out.zones)).toEqual(sortById(g.zones));
      // plantings: compare identity fields, not derived geometry
      const proj = (ps: typeof g.plantings) =>
        sortById(ps).map((p) => ({ id: p.id, parentId: p.parentId, cultivarId: p.cultivarId, x: p.x, y: p.y, label: p.label, icon: p.icon }));
      expect(proj(out.plantings)).toEqual(proj(g.plantings));
    });
  }
});
```

- [ ] **Step 2: Run test, verify it fails or surfaces real mismatches**

Run: `npm test -- src/scene/gardenConverters.test.ts -t 'fixture parity'`
Expected: Initially may FAIL if a fixture exercises a field the converter drops (e.g. nested structures, snap-points layout). **If it fails, that is a real converter gap — fix `gardenToScene`/`sceneToGarden` (do not weaken the assertion).** Re-run until green for all 5 fixtures.

- [ ] **Step 3: Reconcile any gaps in the converters**

If a mismatch appears, the most likely causes (and fixes) are: `rotation`/`shape` default mismatch (ensure `rotation ?? 0`, `shape ?? 'rectangle'` only when truly absent); a structure nested under a structure (ensure parent-before-child emission handles it — covered by `emitStruct` recursion). Apply the minimal converter fix and re-run.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/scene/gardenConverters.test.ts`
Expected: PASS (all fixtures).

- [ ] **Step 5: Commit**

```bash
git add src/scene/gardenConverters.test.ts src/scene/gardenConverters.ts
git commit -m "test(scene): converter round-trips all sample gardens"
```

---

## Phase B — Store facade (Scene as data source, `garden` composed)

This phase makes the store hold `base + scene` and compose `garden` so **existing readers keep working**, while **mutations still go through the legacy snapshot path** (rewired in Phase C). After Phase B the app runs identically and `npm test` is green; only the store's internal representation changed.

### Task B1: Hold scene+base, compose `garden`, recompute on scene change

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenSceneFacade.test.ts` (new)

Design of the composition (add near the top of the store module, before `create(...)`):

```ts
import { createGardenScene, type GardenScene } from '../scene/gardenScene';
import { gardenToScene, sceneToGarden, splitBase } from '../scene/gardenConverters';
import type { GardenBase } from '../scene/gardenScene';
import type { GardenPose, GardenNodeData } from '../scene/gardenScene';

// Module-scoped scene + live-edit override layer. Single instance for the app's garden.
let scene: GardenScene = createGardenScene([]);
let base: GardenBase = splitBase(blankGarden());
// Live, not-yet-committed pose/data edits keyed by node id (Phase C). Empty in Phase B.
const overrides = new Map<string, { pose?: Partial<GardenPose>; data?: Partial<GardenNodeData> }>();

let composed: Garden | null = null;     // memoized garden
let composedVersion = -1;               // scene.getVersion() the memo was built at
let composedBase: GardenBase | null = null;
let overridesDirty = false;

function composeGarden(): Garden {
  const v = scene.getVersion();
  if (composed && composedVersion === v && composedBase === base && !overridesDirty) return composed;
  composed = applyOverrides(sceneToGarden(scene, base));
  composedVersion = v;
  composedBase = base;
  overridesDirty = false;
  return composed;
}
```

`applyOverrides` is identity in Phase B (overrides is always empty); it gets its body in Task C3:

```ts
function applyOverrides(g: Garden): Garden {
  if (overrides.size === 0) return g;
  // Task C3 fills this in.
  return g;
}
```

Wire-up: replace the store's `garden` initial value and the `loadGarden`/`reset` setters so the scene is the source, and subscribe to keep Zustand's `garden` reference fresh.

- [ ] **Step 1: Write the failing test**

```ts
// src/store/gardenSceneFacade.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from './gardenStore';
import { createGarden } from '../model/types';

describe('gardenStore scene-backed facade', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('exposes a Garden composed from the scene after loadGarden', () => {
    const g = createGarden({ name: 'Loaded', widthFt: 12, lengthFt: 9 });
    g.structures = [{ id: 's1', type: 'raised-bed', shape: 'rectangle', x: 1, y: 1, width: 4, length: 8,
      rotation: 0, color: '#aaa', label: 'Bed', zIndex: 0, parentId: null, groupId: null, snapToGrid: true,
      surface: false, container: true, fill: null, layout: null, wallThicknessFt: 0.5, clipChildren: false }];
    useGardenStore.getState().loadGarden(g);

    const garden = useGardenStore.getState().garden;
    expect(garden.name).toBe('Loaded');
    expect(garden.structures).toHaveLength(1);
    expect(garden.structures[0]).toMatchObject({ id: 's1', x: 1, y: 1, width: 4, length: 8 });
  });

  it('returns a stable garden reference until the scene changes', () => {
    const a = useGardenStore.getState().garden;
    const b = useGardenStore.getState().garden;
    expect(a).toBe(b); // memoized per scene version
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/store/gardenSceneFacade.test.ts`
Expected: FAIL (facade not wired; `garden` still the old field or `structures` empty after load).

- [ ] **Step 3: Implement the facade wiring in `src/store/gardenStore.ts`**

Replace the `garden` field initialization and the three lifecycle methods. The store keeps a `garden` field for Zustand selector compatibility, refreshed from `composeGarden()` whenever the scene changes:

```ts
// In create<GardenStore>((set, get) => { ... }) :

// 1. Build the scene from the initial blank garden and keep `garden` in sync.
function refreshGarden() {
  set({ garden: composeGarden() });
}

// Subscribe once so any scene mutation (incl. undo/redo) refreshes the Zustand snapshot.
scene.subscribe(() => { set({ garden: composeGarden() }); });

return {
  garden: composeGarden(),
  // ...

  loadGarden: (g) => {
    clearHistory();                       // nursery history (Phase D)
    const backfilled = backfillGarden(g);
    base = splitBase(backfilled);
    scene = createGardenScene(gardenToScene(backfilled));
    scene.subscribe(() => { set({ garden: composeGarden() }); });
    overrides.clear();
    composed = null; composedVersion = -1; composedBase = null;
    refreshGarden();
  },

  reset: () => {
    clearHistory();
    const g = defaultGarden();
    base = splitBase(g);
    scene = createGardenScene(gardenToScene(g));
    scene.subscribe(() => { set({ garden: composeGarden() }); });
    overrides.clear();
    composed = null; composedVersion = -1; composedBase = null;
    refreshGarden();
  },
  // ...
};
```

> **Note for the implementer:** because `scene` is reassigned in `loadGarden`/`reset`, re-subscribe after each reassignment (as shown). The previous scene is discarded, so its listener leak is harmless within a session, but prefer storing the unsubscribe and calling it before reassigning if a lint rule complains.

Phase B leaves all mutators untouched: they still call `commitPatch`/`patch` which `set({ garden })` directly. To keep those working *temporarily*, change `patch`/`commitPatch` to operate against the composed garden AND mirror into base+scene-free path — **NO.** Instead, keep Phase B minimal: the mutators in C are rewritten next; for B, make `patch`/`commitPatch` update `base` for non-spatial fields and rebuild the scene for spatial fields via `gardenToScene`. The simplest correct bridge:

```ts
function patch(updates: Partial<Garden>) {
  const next = { ...composeGarden(), ...updates };
  base = splitBase(next);
  scene = createGardenScene(gardenToScene(next));
  scene.subscribe(() => { set({ garden: composeGarden() }); });
  composed = null; composedVersion = -1; composedBase = null;
  refreshGarden();
}
```

> This bridge rebuilds the scene on every legacy mutation — correct but coarse (no fine-grained undo yet). Phase C replaces each mutator with real scene ops and deletes this bridge. `commitPatch` keeps calling `pushHistory` for now (Phase D re-scopes history to nursery).

- [ ] **Step 4: Run the facade test AND the full suite**

Run: `npm test -- src/store/gardenSceneFacade.test.ts` → PASS.
Run: `npm test` → still `758 passed` (the bridge preserves legacy behavior; readers see an identical `garden`).
Expected: green. If any store/canvas test regresses, the composition/order differs from the legacy garden — fix `composeGarden` (e.g., array order) until parity holds.

- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenSceneFacade.test.ts
git commit -m "feat(store): scene-backed garden facade (legacy bridge for mutations)"
```

---

## Phase C — Garden-domain mutations → Scene ops

Replace each garden mutator's `commitPatch`/`patch` body with real Scene ops, deleting reliance on the Phase-B rebuild bridge. Introduce the **transaction + override** infrastructure and the **selection ring**.

### Task C1: Mutation infrastructure (batch + selection ring + flush)

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenSceneFacade.test.ts` (append)

Add helpers (module scope, near the scene/overrides declarations):

```ts
import { useUiStore } from './uiStore';

// --- Garden selection ring: one entry per scene undo entry. ---
const selUndo: string[][] = [];  // selection captured *before* each committed garden edit
const selRedo: string[][] = [];

function currentSelection(): string[] { return [...useUiStore.getState().selectedIds]; }

/** Run a synchronous garden edit as ONE undo entry, recording the pre-edit selection. */
function gardenCommit(label: string, fn: () => void) {
  flushOverrides();                 // close any open live session first (ordering)
  const before = currentSelection();
  const v = scene.getVersion();
  scene.batch(label, fn);
  if (scene.getVersion() !== v) {   // only push a selection entry if the batch did something
    selUndo.push(before);
    selRedo.length = 0;
  }
}

/** Flush the live override layer into one Scene batch (Task C3). No-op when empty. */
function flushOverrides() {
  if (overrides.size === 0) return;
  const before = openTxnSelection ?? currentSelection();
  scene.batch(openTxnLabel ?? 'edit', () => {
    for (const [id, ov] of overrides) {
      const node = scene.get(id as never);
      if (!node) continue;
      if (ov.pose) scene.setPose(id as never, { ...(node.pose as object), ...ov.pose } as never);
      if (ov.data) scene.update(id as never, { data: { ...(node.data as object), ...ov.data } as never });
    }
  });
  selUndo.push(before);
  selRedo.length = 0;
  overrides.clear();
  overridesDirty = true;
  openTxnSelection = null;
  openTxnLabel = null;
}

let openTxnSelection: string[] | null = null;
let openTxnLabel: string | null = null;
```

- [ ] **Step 1: Write the failing test**

```ts
import { useUiStore } from './uiStore';

describe('garden mutation = one undo entry + selection ring', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().clearSelection();
  });

  it('addStructure creates exactly one undoable entry', () => {
    expect(useGardenStore.getState().canUndo()).toBe(false);
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    expect(useGardenStore.getState().canUndo()).toBe(true);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('undo restores the selection that was active before the change', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, length: 4 });
    const z1 = useGardenStore.getState().garden.zones[0].id;
    useUiStore.getState().setSelection([z1]);
    useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, length: 4 });
    useUiStore.getState().setSelection([]);
    useGardenStore.getState().undo();
    expect(useUiStore.getState().selectedIds).toEqual([z1]);
  });
});
```

(These mirror the existing `gardenStore.test.ts` assertions — Phase D wires `undo`/`canUndo` to use `selUndo`. This task lands the infra; the test goes green once C1+D are done. To keep the task self-contained, also implement the garden side of `undo`/`canUndo` here:)

```ts
// Garden-mode undo/redo (mode routing added in Phase D). For now expose directly:
function gardenUndo(): boolean {
  flushOverrides();
  if (!scene.canUndo()) return false;
  const before = selUndo.pop();
  selRedo.push(currentSelection());
  scene.undo();
  if (before) useUiStore.getState().setSelection(scrubSelection(before, composeGarden()));
  return true;
}
function gardenRedo(): boolean {
  if (!scene.canRedo()) return false;
  const sel = selRedo.pop();
  selUndo.push(currentSelection());
  scene.redo();
  if (sel) useUiStore.getState().setSelection(scrubSelection(sel, composeGarden()));
  return true;
}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/store/gardenSceneFacade.test.ts -t 'one undo entry'`
Expected: FAIL — `addStructure` still uses the Phase-B bridge (coarse) and `undo` isn't garden-aware yet.

- [ ] **Step 3: Rewrite the structural mutators to use `gardenCommit`**

Replace each of these method bodies (keep signatures identical):

```ts
addStructure: (opts) => {
  // ...existing collision-check + createStructure(opts) -> newStructure...
  gardenCommit('add structure', () => {
    scene.add(specForStructure(newStructure)); // specForStructure = single-node form of gardenToScene
  });
},
removeStructure: (id) => {
  gardenCommit('remove structure', () => {
    // remove orphaned child plantings first (scene.remove drops the subtree, so children go too)
    scene.remove(id as never);
  });
},
addZone: (opts) => {
  const z = createZone(opts);
  gardenCommit('add zone', () => { scene.add(specForZone(z)); });
},
removeZone: (id) => {
  gardenCommit('remove zone', () => { scene.remove(id as never); });
},
addPlanting: (opts) => {
  // ...existing snap-to-free-cell logic to compute the planting + parent...
  gardenCommit('add planting', () => { scene.add(specForPlanting(newPlanting)); });
},
removePlanting: (id) => {
  gardenCommit('remove planting', () => { scene.remove(id as never); });
},
```

Add single-node spec helpers in `gardenConverters.ts` (export `specForStructure`, `specForZone`, `specForPlanting`) factored out of the loops in `gardenToScene` (DRY — have `gardenToScene` call them). Write their unit tests alongside (one each) asserting the produced spec matches the loop output.

> **`scene.remove` drops the whole subtree**, so removing a structure/zone removes its child plantings automatically — this replaces the old "filter orphaned plantings" code. Verify against the existing `removeStructure` test expectations.

- [ ] **Step 4: Run targeted + full suite**

Run: `npm test -- src/store/gardenSceneFacade.test.ts` → the "one undo entry" test passes once Phase D wires `undo`→`gardenUndo` (temporarily point `undo`/`canUndo` at `gardenUndo`/`scene.canUndo` to verify now).
Run: `npm test -- src/store/gardenStore.test.ts` → structural add/remove tests pass.
Expected: green for structural mutators.

- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/scene/gardenConverters.ts src/scene/gardenConverters.test.ts src/store/gardenSceneFacade.test.ts
git commit -m "feat(store): structural garden mutations via Scene ops + selection ring"
```

---

### Task C2: `commit*Update` mutators → `scene.setPose` / `scene.update` / `scene.move`

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.test.ts` (existing commit-update tests must stay green)

Map each committed update to pose vs data vs parent changes inside one `gardenCommit`:

```ts
commitStructureUpdate: (id, updates) => {
  gardenCommit('update structure', () => { applyStructureUpdate(id, updates); });
  // rearrangePlantings on layout change still runs — but now as scene.setPose calls on children
},
commitZoneUpdate: (id, updates) => { gardenCommit('update zone', () => { applyZoneUpdate(id, updates); }); },
commitPlantingUpdate: (id, updates) => { gardenCommit('update planting', () => { applyPlantingUpdate(id, updates); }); },
```

Where `applyStructureUpdate(id, updates)` splits `updates` into:
- pose fields (`x,y,width,length→height,rotation,shape`) → merge into current pose, `scene.setPose`;
- `parentId` change → `scene.move(id, newParent)`;
- everything else (data fields) → `scene.update(id, { data: { ...node.data, ...dataUpdates } })`;
- zIndex change → update `data.zIndex` AND `scene.reorder` siblings to keep order derived (see design "zIndex → render order").

Provide the full `applyStructureUpdate`/`applyZoneUpdate`/`applyPlantingUpdate` helpers (they are the heart of this task — write them completely, with the `length`↔`height` translation and the `rearrangePlantings` call re-expressed as child `scene.setPose` calls within the same batch).

- [ ] **Step 1: Write the failing test**

```ts
it('commitStructureUpdate moves a structure as one undo step', () => {
  useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
  const id = useGardenStore.getState().garden.structures[0].id;
  useGardenStore.getState().commitStructureUpdate(id, { x: 3, y: 5 });
  expect(useGardenStore.getState().garden.structures[0]).toMatchObject({ x: 3, y: 5 });
  useGardenStore.getState().undo();
  expect(useGardenStore.getState().garden.structures[0]).toMatchObject({ x: 0, y: 0 });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- src/store/gardenStore.test.ts -t 'commitStructureUpdate moves'` → FAIL.
- [ ] **Step 3: Implement** `applyStructureUpdate`/`applyZoneUpdate`/`applyPlantingUpdate` + rewire the three `commit*Update` methods.
- [ ] **Step 4: Run** `npm test -- src/store/gardenStore.test.ts` → all commit-update + layout-rearrange tests green.
- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenStore.test.ts
git commit -m "feat(store): commit*Update via scene.setPose/update/move"
```

---

### Task C3: Live `update*` → override layer + deferred flush; `checkpoint()` opens a session

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenSceneFacade.test.ts` (append)

Implement `applyOverrides` (used by `composeGarden`) and rewire the **live** mutators (`updateStructure`/`updateZone`/`updatePlanting`) plus `checkpoint()`:

```ts
function applyOverrides(g: Garden): Garden {
  if (overrides.size === 0) return g;
  const ov = overrides;
  const patchStruct = (s: Structure): Structure => {
    const o = ov.get(s.id); if (!o) return s;
    return { ...s, ...(o.data as object), ...poseToStruct(o.pose) };
  };
  // poseToStruct maps {x,y,width,height,rotation,shape} -> {x,y,width,length,rotation,shape}
  return {
    ...g,
    structures: g.structures.map(patchStruct),
    zones: g.zones.map(patchZone),
    plantings: g.plantings.map(patchPlanting),
  };
}

// Live mutator: writes the override, no Scene mutation, no history. Marks the facade dirty.
function liveUpdate(id: string, kind: 'pose' | 'data', patch: object) {
  const cur = overrides.get(id) ?? {};
  overrides.set(id, kind === 'pose' ? { ...cur, pose: { ...cur.pose, ...patch } } : { ...cur, data: { ...cur.data, ...patch } });
  overridesDirty = true;
  set({ garden: composeGarden() });
}
```

Rewire the store methods (split incoming `updates` into pose vs data, translate `length→height`):

```ts
updateStructure: (id, updates) => { const { pose, data } = splitStructureUpdate(updates); if (pose) liveUpdate(id, 'pose', pose); if (data) liveUpdate(id, 'data', data); },
updateZone:      (id, updates) => { const { pose, data } = splitZoneUpdate(updates);      if (pose) liveUpdate(id, 'pose', pose); if (data) liveUpdate(id, 'data', data); },
updatePlanting:  (id, updates, opts) => { /* x,y -> pose; cultivarId/label/icon -> data; opts.skipRearrange respected */ },

checkpoint: () => {
  flushOverrides();                         // close any prior live session as one entry
  openTxnSelection = currentSelection();     // capture selection for the NEXT session
  openTxnLabel = 'edit';
},
```

This yields the required behavior: PropertiesPanel typing and `animateRotation` frames write overrides (visible immediately via the facade, no history churn); the session becomes exactly one undo entry when the next `checkpoint()`, structural edit, `undo`, or save flushes it.

- [ ] **Step 1: Write the failing test**

```ts
it('a rotate-style live session collapses to one undo entry', () => {
  useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
  const id = useGardenStore.getState().garden.structures[0].id;
  const undoDepthBefore = (() => { let n = 0; while (useGardenStore.getState().canUndo()) { useGardenStore.getState().undo(); n++; } return n; })();
  // rebuild
  useGardenStore.getState().reset(); useGardenStore.getState().loadGarden(blankGarden());
  useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
  const sid = useGardenStore.getState().garden.structures[0].id;

  useGardenStore.getState().checkpoint();                 // opens session
  for (let i = 0; i < 8; i++) useGardenStore.getState().updateStructure(sid, { rotation: i * 10 }); // frames
  useGardenStore.getState().updateStructure(sid, { rotation: 90 });
  // live value is visible without committing history
  expect(useGardenStore.getState().garden.structures[0].rotation).toBe(90);

  // one undo reverts the whole rotation session back to the add-state (rotation 0)
  useGardenStore.getState().undo();
  expect(useGardenStore.getState().garden.structures[0].rotation).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- src/store/gardenSceneFacade.test.ts -t 'live session'` → FAIL.
- [ ] **Step 3: Implement** `applyOverrides`, `liveUpdate`, the split helpers, the live mutators, and `checkpoint`.
- [ ] **Step 4: Run** `npm test -- src/store/gardenSceneFacade.test.ts src/store/gardenStore.test.ts` → green. Then `npm test` → 758 (plus new tests).
- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenSceneFacade.test.ts
git commit -m "feat(store): live update overrides + checkpoint session flush"
```

---

### Task C4: Delete the Phase-B rebuild bridge; route `setCollection`/`updateGarden`/`setBlueprint` through `base`

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.test.ts`

Non-spatial mutators update `base` directly (no scene rebuild) and refresh:

```ts
updateGarden: (updates) => { base = { ...base, ...updates }; set({ garden: composeGarden() }); },  // name/dims/unit/groundColor
setBlueprint: (bp) => { base = { ...base, blueprint: bp }; set({ garden: composeGarden() }); },
setCollection: (collection) => { base = { ...base, collection }; set({ garden: composeGarden() }); persistCollectionToDisk?.(); },
```

Then **delete** the Phase-B `patch`/`commitPatch` bridge bodies (the scene-rebuild versions) — confirm no garden-domain caller remains by grepping:

- [ ] **Step 1: Grep for surviving bridge callers**

Run: `grep -n "commitPatch\|function patch(" src/store/gardenStore.ts`
Expected: only **nursery** mutators still call `commitPatch` (those move to nursery history in Phase D). No structure/zone/planting mutator should reference `patch`/`commitPatch`/the rebuild bridge.

- [ ] **Step 2: Write/adjust test** — existing `gardenStore.test.ts` metadata tests (`updateGarden`, `setBlueprint`, `setCollection`) must stay green.
- [ ] **Step 3: Implement** the three base-routed methods; remove the spatial rebuild bridge.
- [ ] **Step 4: Run** `npm test -- src/store/gardenStore.test.ts` → green.
- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts
git commit -m "refactor(store): non-spatial mutators write base; drop scene-rebuild bridge"
```

---

## Phase D — Mode-routed undo + nursery snapshot history

### Task D1: Re-scope `history.ts` to nursery snapshots

**Files:**
- Modify: `src/store/history.ts`
- Modify: `src/store/history.test.ts`

`history.ts` becomes a `NurseryState`-snapshot stack (it currently snapshots the whole `Garden`). Keep the same `MAX_HISTORY = 100`, `past`/`future`, `canUndo`/`canRedo`/`clearHistory` API; change the entry type:

```ts
import type { NurseryState } from '../model/nursery';
const MAX_HISTORY = 100;
export interface NurseryHistoryEntry { nursery: NurseryState; selectedIds: string[]; }
let past: NurseryHistoryEntry[] = [];
let future: NurseryHistoryEntry[] = [];
export function pushHistory(nursery: NurseryState, selectedIds: string[]): void { /* structuredClone(nursery) */ }
export function undo(current: NurseryState, selectedIds: string[]): NurseryHistoryEntry | null { /* … */ }
export function redo(current: NurseryState, selectedIds: string[]): NurseryHistoryEntry | null { /* … */ }
export function canUndo(): boolean; export function canRedo(): boolean; export function clearHistory(): void;
```

- [ ] **Step 1: Update `history.test.ts`** to construct `emptyNurseryState()`-based entries instead of gardens, asserting the same push/undo/redo/selection semantics. Run → FAIL.
- [ ] **Step 2: Implement** the retyped `history.ts`.
- [ ] **Step 3: Run** `npm test -- src/store/history.test.ts` → green.
- [ ] **Step 4: Commit**

```bash
git add src/store/history.ts src/store/history.test.ts
git commit -m "refactor(history): nursery-only snapshot stack"
```

---

### Task D2: Nursery mutators use nursery history; garden `checkpoint`/`undo`/`redo` route by `appMode`

**Files:**
- Modify: `src/store/gardenStore.ts`
- Test: `src/store/gardenStore.test.ts` (nursery undo tests), `src/store/gardenSceneFacade.test.ts`

Nursery mutators (`addTray`/`removeTray`/`renameTray`/`reorderTrays`/`sowCell`/`fillTray`/`fillRow`/`fillColumn`/`clearCell`/`moveSeedling`/`moveSeedlingGroup`/`moveSeedlingsAcrossTrays`) currently call `commitPatch({ nursery: … })`. Replace with a nursery commit helper:

```ts
function nurseryCommit(mutate: (n: NurseryState) => NurseryState) {
  pushHistory(base.nursery, currentSelection());     // snapshot BEFORE
  base = { ...base, nursery: mutate(base.nursery) };
  set({ garden: composeGarden() });
}
```

Mode-routed lifecycle:

```ts
checkpoint: () => {                       // garden-mode session checkpoint (Phase C). Nursery uses nurseryCommit directly.
  if (useUiStore.getState().appMode === 'garden') { flushOverrides(); openTxnSelection = currentSelection(); openTxnLabel = 'edit'; }
},
undo: () => { if (useUiStore.getState().appMode === 'nursery') return nurseryUndo(); return void gardenUndo(); },
redo: () => { if (useUiStore.getState().appMode === 'nursery') return nurseryRedo(); return void gardenRedo(); },
canUndo: () => useUiStore.getState().appMode === 'nursery' ? canUndo() /* history.ts */ : (scene.canUndo() || overrides.size > 0),
canRedo: () => useUiStore.getState().appMode === 'nursery' ? canRedo() : scene.canRedo(),
```

`nurseryUndo`/`nurseryRedo` mirror the old store `undo`/`redo` but against `base.nursery`:

```ts
function nurseryUndo() {
  const prev = undo(base.nursery, currentSelection());   // history.ts undo
  if (!prev) return false;
  base = { ...base, nursery: prev.nursery };
  set({ garden: composeGarden() });
  useUiStore.getState().setSelection(scrubSelection(prev.selectedIds, composeGarden()));
  return true;
}
```

> Note `scrubSelection` already prunes ids absent from the garden; it works unchanged against the composed garden.

- [ ] **Step 1: Write the failing test**

```ts
it('nursery edits undo independently of garden edits (separate histories)', () => {
  useUiStore.getState().setAppMode('garden');
  useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 8 });
  useUiStore.getState().setAppMode('nursery');
  useGardenStore.getState().addTray({ id: 't1', label: 'Tray', rows: 2, cols: 2, cellSizeIn: 2, slots: [null, null, null, null] } as never);
  expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(1);
  useGardenStore.getState().undo();                       // nursery mode -> nursery history
  expect(useGardenStore.getState().garden.nursery.trays).toHaveLength(0);
  expect(useGardenStore.getState().garden.structures).toHaveLength(1); // garden untouched
  useUiStore.getState().setAppMode('garden');
  useGardenStore.getState().undo();                       // garden mode -> scene
  expect(useGardenStore.getState().garden.structures).toHaveLength(0);
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- src/store/gardenSceneFacade.test.ts -t 'separate histories'` → FAIL.
- [ ] **Step 3: Implement** `nurseryCommit`/`nurseryUndo`/`nurseryRedo`, rewire all nursery mutators to `nurseryCommit`, and the mode-routed lifecycle methods.
- [ ] **Step 4: Run** `npm test -- src/store/gardenStore.test.ts src/store/gardenSceneFacade.test.ts` → green. Then `npm test`.
- [ ] **Step 5: Commit**

```bash
git add src/store/gardenStore.ts src/store/gardenSceneFacade.test.ts
git commit -m "feat(store): mode-routed undo (garden=scene, nursery=snapshot)"
```

---

## Phase E — Adapters route to Scene ops

The garden gesture adapters currently mutate via `useGardenStore().updateStructure/updateZone/updatePlanting` (now override-only) and raw `setState({ garden })`, committing via `checkpoint()` + ops. Re-point them at Scene ops wrapped in one `gardenCommit`. Expose a thin store method the adapters call:

```ts
// gardenStore public method:
runGardenBatch: (label, fn) => { gardenCommit(label, fn); },
// plus scene-level helpers the adapters use inside the batch:
sceneSetStructurePose: (id, { x, y, width, length, rotation }) => { /* setPose w/ height=length */ },
sceneSetParent: (id, parentId) => { scene.move(id, parentId ? asNodeId(parentId) : null); },
sceneInsert: (spec) => { scene.add(spec); },
sceneRemove: (id) => { scene.remove(id as never); },
```

### Task E1: `structureMove.ts` + `zoneMove.ts` + `plantingMove.ts`

**Files:**
- Modify: `src/canvas/adapters/structureMove.ts`, `zoneMove.ts`, `plantingMove.ts`
- Test: `src/canvas/drag/moveDrag.test.ts` (existing), adapter tests under `src/canvas/tools/`

Rewrite each adapter's mutating methods so `applyBatch` opens one `gardenCommit` and ops mutate the scene:

```ts
// structureMove.ts (full replacement of the mutating methods)
setPose(id, pose) { useGardenStore.getState().sceneSetStructurePose(id, { x: pose.x, y: pose.y, width: pose.widthFt, length: pose.lengthFt }); },
setParent(id, parentId) { useGardenStore.getState().sceneSetParent(id, parentId); },
insertNode(s) { useGardenStore.getState().sceneInsert(specForStructure(s)); },
removeNode(id) { useGardenStore.getState().sceneRemove(id); },
applyBatch(ops, label) { useGardenStore.getState().runGardenBatch(label ?? 'move', () => { for (const op of ops) op.apply(adapter); }); },
```

> `setPose`/`setParent`/`insertNode`/`removeNode` are only ever called *inside* `applyBatch` (drags use `dragPreview` for live preview, never mid-flight store writes — see `moveDrag.ts` doc comment), so calling scene ops directly inside the enclosing `gardenCommit` batch produces exactly one undo entry per gesture, matching today.

- [ ] **Step 1: Run the existing adapter/drag tests to capture current behavior** — `npm test -- src/canvas/drag/moveDrag.test.ts src/canvas/tools/` → green at baseline.
- [ ] **Step 2: Rewrite** the three adapters as above; update any test that asserted the old `setState`/`updateStructure` calls to assert scene state instead (read back via `useGardenStore.getState().garden.structures`).
- [ ] **Step 3: Run** the same tests → green.
- [ ] **Step 4: Commit**

```bash
git add src/canvas/adapters/structureMove.ts src/canvas/adapters/zoneMove.ts src/canvas/adapters/plantingMove.ts src/canvas/drag/moveDrag.test.ts
git commit -m "feat(canvas): move adapters mutate the Scene"
```

---

### Task E2: `structureResize.ts` + `zoneResize.ts`

**Files:**
- Modify: `src/canvas/adapters/structureResize.ts`, `zoneResize.ts`
- Test: `src/canvas/drag/resizeDrag.test.ts`

Same pattern: `applyBatch`→`runGardenBatch`; `setPose` (which carries width/length/x/y on resize) → `sceneSetStructurePose`/`sceneSetZonePose`.

- [ ] **Step 1: Run** `npm test -- src/canvas/drag/resizeDrag.test.ts` → baseline green.
- [ ] **Step 2: Rewrite** both resize adapters; update test reads to scene-backed `garden`.
- [ ] **Step 3: Run** → green.
- [ ] **Step 4: Commit**

```bash
git add src/canvas/adapters/structureResize.ts src/canvas/adapters/zoneResize.ts src/canvas/drag/resizeDrag.test.ts
git commit -m "feat(canvas): resize adapters mutate the Scene"
```

---

### Task E3: `insert.ts` (plot insert) + `gardenScene.ts` (kit SceneAdapter)

**Files:**
- Modify: `src/canvas/adapters/insert.ts`, `src/canvas/adapters/gardenScene.ts`
- Test: `src/canvas/drag/plotDrag.test.ts`, plus any `gardenScene` adapter test

`insert.ts:172` does `checkpoint()` then inserts — convert to `runGardenBatch('insert', () => scene.add(...))`. `gardenScene.ts` (lines 105–135, 160) does live `updateStructure/updateZone/updatePlanting` + `checkpoint()` inside its `applyBatch`; convert identically. Confirm `gardenScene.ts`'s read getters (`getNode/getNodes/getPose/...`) still read `useGardenStore.getState().garden.*` — those keep working via the facade unchanged.

- [ ] **Step 1: Run** `npm test -- src/canvas/drag/plotDrag.test.ts` → baseline green.
- [ ] **Step 2: Rewrite** insert + gardenScene mutating paths; update tests to scene-backed reads.
- [ ] **Step 3: Run** → green.
- [ ] **Step 4: Commit**

```bash
git add src/canvas/adapters/insert.ts src/canvas/adapters/gardenScene.ts src/canvas/drag/plotDrag.test.ts
git commit -m "feat(canvas): insert + kit scene adapter mutate the Scene"
```

---

## Phase F — Hidden-writer sweep, load/save, ship gate

### Task F1: Hidden-writer sweep

**Files:**
- Grep across `src/` (no specific file)

The design warns a missed direct writer silently diverges the scene from the facade.

- [ ] **Step 1: Grep** for direct garden writes:

Run: `grep -rn "setState((\?s\|st\)\? *=> *(\?{ *garden\|set({ garden\|garden: {" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
Expected: **only** `gardenStore.ts`'s `set({ garden: composeGarden() })` refresh calls remain. Any other production writer (e.g. a missed adapter) must be converted to a Scene op or `base` write.

- [ ] **Step 2:** Convert any stragglers found (none expected after Phase E). For each, add a regression test reading back from `garden`.
- [ ] **Step 3: Commit** (if changes) — `git commit -am "fix(store): route remaining direct garden writers through the Scene"`.

---

### Task F2: Load/save round-trip through the store

**Files:**
- Test: `src/store/gardenSceneFacade.test.ts` (append)
- Verify (no edit expected): `src/utils/file.ts`

`serializeGarden(get().garden)` already serializes the composed garden; `deserializeGarden`→`loadGarden` builds the scene. Add an end-to-end store round-trip test.

- [ ] **Step 1: Write the test**

```ts
import { deserializeGarden, serializeGarden } from '../utils/file';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('round-trips a .garden file through the scene-backed store (modulo migrations)', () => {
  const json = readFileSync(join(process.cwd(), 'public', 'default.garden'), 'utf8');
  const loaded = deserializeGarden(json);
  useGardenStore.getState().loadGarden(loaded);
  const saved = deserializeGarden(serializeGarden(useGardenStore.getState().garden));
  const norm = (g: typeof loaded) => ({
    structures: [...g.structures].sort((a, b) => a.id.localeCompare(b.id)),
    zones: [...g.zones].sort((a, b) => a.id.localeCompare(b.id)),
    plantings: [...g.plantings].map((p) => ({ id: p.id, parentId: p.parentId, cultivarId: p.cultivarId, x: p.x, y: p.y })).sort((a, b) => a.id.localeCompare(b.id)),
    nursery: g.nursery, name: g.name, widthFt: g.widthFt, lengthFt: g.lengthFt,
  });
  expect(norm(saved)).toEqual(norm(loaded));
});
```

- [ ] **Step 2: Run, fix any divergence in the converters**, re-run → green.
- [ ] **Step 3: Commit**

```bash
git add src/store/gardenSceneFacade.test.ts
git commit -m "test(store): .garden round-trip through the scene-backed store"
```

---

### Task F3: Full ship gate

**Files:** none (verification only)

- [ ] **Step 1: Unit suite** — `npm test` → **≥ 758 passed**, 0 failed (new scene/facade tests add to the count).
- [ ] **Step 2: Typecheck + build** — `npm run build` → clean.
- [ ] **Step 3: Lint** — `npm run lint` → clean (run `npm run lint:fix` for trivial formatting).
- [ ] **Step 4: Optimizer boundary** — `npm run check:optimizer-boundary` → `Optimizer boundary clean.`
- [ ] **Step 5: Visual regression** — `npm run test:visual` → all baselines match (no pixel change). If a diff appears, it indicates a render-order or pose divergence — fix the converter (do NOT update baselines).
- [ ] **Step 6: Manual smoke** — `npm run dev`, open `http://localhost:53305/garden/`:
  - Garden: add a bed, move it, resize it, rotate it, add a planting inside it, delete it; Cmd-Z / Cmd-Shift-Z each step; confirm selection restores on undo.
  - Save to a `.garden` file and reload it; confirm identical.
  - Switch to nursery: add a tray, sow cells, move a seedling; Cmd-Z; confirm nursery undo works and does NOT disturb the garden.
- [ ] **Step 7: Final commit / branch wrap**

```bash
git add -A && git commit -m "chore(sp1): scene data core ship-gate green"
```

Then use **superpowers:finishing-a-development-branch** to decide merge/PR. (Do NOT open a PR without Mike's go-ahead.)

---

## Self-review (completed against the SP1 spec)

- **Scene type params / GardenNodeData / GardenPose** — Task A1. ✔
- **Node mapping (container/leaf, layers, parent, pose, zIndex order)** — Tasks A2/A3, C2 (zIndex reorder). ✔
- **Pose decisions (planting square pose from footprint; length↔height; shape/rotation ride-along)** — A2/A3 (`plantingPose`, `structurePose`, `poseToStruct`). ✔
- **`.garden` ⇄ Scene converters wired at load/save** — A2/A3 + B1 (`loadGarden`) + F2 (serialize). `file.ts` unchanged (on-disk format preserved). ✔
- **Undo swap to Scene history + batch** — C1/C2/C3; one entry per logical edit. ✔
- **Selection-after-undo (ring, not just prune)** — C1 (`selUndo`/`selRedo`), D2 (`scrubSelection` retained for dangling prune). Resolves spec open-question via existing tests. ✔
- **React re-render via scene subscribe; gardenStore read facade** — B1 (`composeGarden` + `scene.subscribe` → `set({ garden })`), memoized per `getVersion()`. ✔
- **Optimizer boundary** — untouched; F3 gate. ✔
- **Nursery stays in store** — D1/D2 (nursery snapshot history, mode-routed undo); separate histories per Mike's decision. ✔
- **Hidden writers** — F1 sweep converts `structureMove`/`zoneMove` raw `setState` (E1) and any straggler. ✔
- **Open questions:** pin↔HEAD delta (no SP1-used signature changed — verified, no shim); selection parity (ring required — tests prove it); nesting depth (converter recursion handles arbitrary depth; A4 fixtures verify); zIndex write-back (C2 reorders on zIndex change). ✔

**Known intentional deviations from pre-SP1 behavior:** (1) garden/nursery undo are now separate timelines (Mike-approved); (2) a PropertiesPanel live-edit session becomes one undo entry at its flush boundary rather than folding silently into the prior checkpoint — arguably more correct, still coarse-grained.

---

## REVISED PHASES C–F (Option B — "split snapshot stacks", chosen by Mike 2026-06-13)

**Supersedes the original Phases C, D, E above.** During execution we found that moving garden
undo onto weasel **Scene history** would require an atomic cutover plus extra machinery (a live-edit
override layer + a custom Scene op for metadata undo), because a Scene rebuild wipes Scene history
and the old single snapshot stack bundled garden+nursery+metadata. Mike chose the simpler path:
**keep snapshot-based undo, split it into two stacks routed by `appMode`.** The Scene remains the
read source (B1, done) and is rebuilt on undo via `adoptGarden`. **The Scene does NOT own undo in
SP1; SP2 performs the scene-history swap.** See memory `sp1-undo-split`.

Consequences:
- **No scene-op mutation rewrite.** The B1 bridge stays: mutators → `patch`/`commit*` → scene
  rebuilt from the composed garden. Old tasks C1–C3 and E1–E3 (adapters → Scene ops) are **dropped**.
- Remaining tasks: **D1** (history → generic factory, one instance, no behavior change), **D2** (add
  nursery instance, split commit + route undo/checkpoint by `appMode`), **F1** (fix hidden direct
  `setState({garden})` writers), **F2** (store round-trip), **F3** (ship gate).

**D1 — generic history factory.** Refactor `src/store/history.ts` to export
`createHistoryStack<T>()` returning `{ push(value, selectedIds), undo(current, selectedIds),
redo(current, selectedIds), canUndo(), canRedo(), clear() }` (each snapshot = `structuredClone(value)`
+ `selectedIds`; cap 100; push clears redo). Update `gardenStore` to use ONE
`const gardenHistory = createHistoryStack<Garden>()` in place of the old module functions — pure
mechanical swap, behavior identical. Update `history.test.ts` for the factory. `delete.ts` and any
other `pushHistory` caller route through the store (see D2). Full suite stays green.

**D2 — two stacks, mode-routed.**
- Add `const nurseryHistory = createHistoryStack<NurseryState>()`.
- `commitGarden(updates: Partial<Garden>)` = `gardenHistory.push(get().garden, sel); patch(updates)`.
- `commitNursery(next: NurseryState)` = `nurseryHistory.push(get().garden.nursery, sel); patch({ nursery: next })`.
- Reassign every mutator: nursery mutators (payload touches `nursery`) → `commitNursery`; all garden
  mutators (structures/zones/plantings/blueprint/metadata) → `commitGarden`.
- `checkpoint()` routes by `appMode`: garden → `gardenHistory.push(get().garden, sel)`; nursery →
  `nurseryHistory.push(get().garden.nursery, sel)`. Update `delete.ts` to call `checkpoint()` instead
  of `pushHistory` directly.
- `undo()`/`redo()` route by `appMode`. Garden: `adoptGarden({ ...snap.garden, nursery: get().garden.nursery })`
  (overlay LIVE nursery so cross-mode edits aren't reverted) + restore selection via `scrubSelection`.
  Nursery: `patch({ nursery: snap.value })` + restore selection.
- `canUndo()`/`canRedo()` route by `appMode`. `loadGarden`/`reset` clear BOTH stacks.
- Test: garden and nursery edits undo independently (the separate-histories test).

**F1 — hidden writers.** `zoneMove.ts`/`structureMove.ts` `insertNode`/`removeNode` call
`useGardenStore.setState((s) => ({ garden: {...} }))` directly, which the facade overwrites on the
next compose. Route them through the bridge: add narrow store methods (e.g. `insertStructure(s)` /
`removeStructureById(id)` that call `patch({ structures: ... })`, no history — the surrounding gesture
`checkpoint()` owns the undo entry) and call those from the adapters. Grep for any other direct
`set({ garden })` / `setState({ garden })` writer and convert. (`undo`/`redo`/`adoptGarden`'s own
`set({ garden: composeGarden() })` refresh calls are the only legitimate ones.)

**F2 / F3** — unchanged from the original plan (store round-trip test; full ship gate).
