# Weasel 0.2.0 WebGL Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port garden-planner from weasel's old 2D-canvas API to weasel 0.2.0 (WebGL2-only), achieve full feature parity, and add a Playwright + pixelmatch visual-regression rig with committed baselines.

**Architecture:** Mechanical conversion of every `RenderLayer.draw(ctx, ...)` and tool overlay to the new `draw(data, view, dims): DrawCommand[]` signature. Patterns rebuild on `TextureHandle`. Drag ghosts rebuild on `defineDragInsertTool`. Visual rig runs against `?fixture=<name>` URL params that hydrate the existing Zustand store via `deserializeGarden`.

**Tech Stack:** TypeScript, React 19, Zustand, Vite, Vitest, weasel 0.2.0 (`@orochi235/weasel`), Playwright (new), pixelmatch (new).

**Spec:** `docs/superpowers/specs/2026-05-09-weasel-webgl-port-design.md`

---

## File Structure

**Files modified (port):**
- `src/canvas/patterns.ts` — full rewrite to `TextureHandle` API
- `src/canvas/layers/systemLayersWorld.ts`
- `src/canvas/layers/debugLayers.ts`
- `src/canvas/layers/zoneLayersWorld.ts`
- `src/canvas/layers/trayLayersWorld.ts`
- `src/canvas/layers/structureLayersWorld.ts`
- `src/canvas/layers/seedlingLayersWorld.ts`
- `src/canvas/layers/plantingLayersWorld.ts`
- `src/canvas/layers/selectionLayersWorld.ts`
- `src/canvas/drag/dragPreviewLayer.ts`
- `src/canvas/tools/useEricSelectTool.ts` (overlay only; WIP preserved)
- `src/canvas/tools/useSeedlingMoveTool.ts`
- `src/canvas/tools/useEricCycleTool.ts`
- `src/canvas/tools/useFillTrayTool.ts`
- `src/canvas/tools/useGardenPaletteDropTool.ts` (drag-ghost rebuild)
- `src/canvas/tools/usePaletteDropTool.ts` (drag-ghost rebuild)
- `src/canvas/CanvasNewPrototype.tsx`, `SeedStartingCanvasNewPrototype.tsx` — prop cleanup
- `src/components/App.tsx` — fixture loader + `NodeId` brand fix
- `src/store/gardenStore.test.ts` — `NodeId` brand fix
- Several colocated `*.test.ts` files (per triage rule)

**Files created (visual rig):**
- `tests/visual/visual.spec.ts`
- `tests/visual/visual.config.ts` — playwright config
- `tests/visual/README.md`
- `tests/visual/fixtures/garden-empty.garden`
- `tests/visual/fixtures/garden-mixed.garden`
- `tests/visual/fixtures/garden-mixed-selected.garden`
- `tests/visual/fixtures/garden-zoomed-in.garden`
- `tests/visual/fixtures/seed-empty.garden`
- `tests/visual/fixtures/seed-with-seedlings.garden`
- `tests/visual/fixtures/seed-sown-cells.garden`
- `tests/visual/baselines/*.png` (committed after capture)
- `src/dev/fixtureLoader.ts` — dev-only `?fixture=<name>` hydration
- `src/canvas/util/viewToMat3Local.ts` — only if weasel doesn't export `viewToMat3` (verified in Task 4)

---

## Layer Port Idiom (read once, applies to Tasks 4-11)

The new `RenderLayer<TData>` interface is:

```ts
interface RenderLayer<TData> {
  id: string;
  label: string;
  draw: (data: TData, view: View, dims: Dims) => DrawCommand[];
  defaultVisible?: boolean;
  alwaysOn?: boolean;
  space?: 'world' | 'screen';   // default: 'world'
}
```

Where:
- `View = { x, y, scale }` — world point at canvas top-left + pixels per world unit.
- `Dims = { width, height }` — canvas size in CSS px (use for screen-anchored chrome).
- `DrawCommand` is a tagged union: `'path' | 'group' | 'text' | 'image' | 'shader'`.

**World-space layers MUST wrap their content** in a `kind: 'group'` whose `transform` is `viewToMat3(view)` — `drawLayers` does NOT compose this for you. Screen-space layers emit CSS-pixel coordinates directly.

### Minimal world-space layer template

```ts
import { type RenderLayer, type DrawCommand, viewToMat3, rectPath } from '@orochi235/weasel';

function createMyLayer(): RenderLayer<MyData> {
  return {
    id: 'my-layer',
    label: 'My Layer',
    draw(data, view, _dims): DrawCommand[] {
      const children: DrawCommand[] = [
        {
          kind: 'path',
          path: rectPath(0, 0, 100, 100),
          fill: { fill: 'solid', color: '#444' },
        },
      ];
      return [{ kind: 'group', transform: viewToMat3(view), children }];
    },
  };
}
```

**Important field naming gotcha:** `PathDrawCommand.fill` (not `paint`!). The field name is `fill: Paint`.

### Imperative-ctx → DrawCommand cheat sheet

| Old ctx call | New DrawCommand |
|---|---|
| `ctx.fillRect(x,y,w,h)` with `ctx.fillStyle=color` | `{ kind: 'path', path: rectPath(x,y,w,h), fill: { fill: 'solid', color } }` |
| `ctx.strokeRect(x,y,w,h)` with `ctx.strokeStyle/lineWidth` | `{ kind: 'path', path: rectPath(x,y,w,h), stroke: { paint: { fill: 'solid', color }, width } }` |
| `ctx.beginPath(); ctx.moveTo(...); ctx.lineTo(...); ctx.closePath(); ctx.fill()` | `{ kind: 'path', path: polygonFromPoints(points), fill: ... }` |
| Curved path (`bezierCurveTo`/`quadraticCurveTo`) | Build via `new PathBuilder().moveTo(...).bezierTo(...).build()` |
| `ctx.fillText(text, x, y)` | `{ kind: 'text', x, y, text, style: { fontFamily, fontSize, color, ... } }` (style.fontFamily must be registered via `registerFont`) |
| `ctx.save(); ctx.translate(tx,ty); ...; ctx.restore()` | Wrap children in `{ kind: 'group', transform: [1,0,0, 0,1,0, tx,ty,1], children }` (column-major Mat3) |
| `ctx.globalAlpha = a` for a region | `{ kind: 'group', alpha: a, children }` |
| Pattern fill (`ctx.fillStyle = pattern`) | `fill: { fill: 'pattern', pattern: textureHandle, opacity? }` (see patterns.ts task) |

**Tests**: for each layer's colocated `.test.ts`, classify each `it(...)` block:
- Behavior assertion (state/return/hit-test/snap output) → keep, fix mechanical type errors only
- Pure rendering assertion (`expect(ctx.fillRect).toHaveBeenCalled...`) → delete the `it` block
- If the whole file is rendering assertions → delete the file, list it in commit msg

---

## Task 1: Branch + WIP carry-over

**Files:**
- New branch: `port/weasel-0.2`

- [ ] **Step 1: Stash WIP and create the branch**

```bash
cd /Users/mike/src/eric
git status   # confirm 4 modified files: plantingLayout.ts, plantingMove.ts, findSnapContainer.ts, useEricSelectTool.ts
git stash push -m "weasel port WIP"
git checkout -b port/weasel-0.2
git stash pop
```

Expected: working tree shows the same 4 modified files on the new branch.

- [ ] **Step 2: Commit the WIP as the starting point**

```bash
git add src/canvas/adapters/plantingLayout.ts src/canvas/adapters/plantingMove.ts src/canvas/findSnapContainer.ts src/canvas/tools/useEricSelectTool.ts
git commit -m "wip: in-flight weasel port work (carry-over from main)"
```

Expected: clean working tree.

---

## Task 2: Quick API-surface fixes — `Dims`/`View` confusions

**Files:**
- Modify: `src/canvas/layers/debugLayers.ts` (e.g. `view.scale` references where `view: View` was actually `Dims`)
- Modify: any other file that the typecheck pass reports `Property 'scale' does not exist on type 'Dims'` on

- [ ] **Step 1: List the offenders**

```bash
npx tsc -b 2>&1 | grep -E "Property 'scale' does not exist on type 'Dims'|Property 'x' does not exist on type 'Dims'|Property 'y' does not exist on type 'Dims'" | sed -E 's/^([^(]+)\(.*$/\1/' | sort -u
```

Note the file list — typically `debugLayers.ts`, `useSeedlingMoveTool.ts`, `plantingLayersWorld.ts`. These are spots where code reads `view.scale` from a parameter typed `Dims`. The new signature is `draw(data, view: View, dims: Dims)` — the third arg is the canvas size, the second is the camera. Just renaming the parameter (or splitting them) fixes most of these.

- [ ] **Step 2: For each file in the list, walk through and split `(ctx, _data, view: View)` into `(_data, view: View, dims: Dims)`**

Don't bother actually returning DrawCommands yet — that's the next task per file. Just fix the parameter type names so the "wrong type" errors disappear. Leave the body broken for now (the body fix happens in the per-file layer port tasks).

For files that are pure overlays (e.g. `useSeedlingMoveTool.ts`'s overlay block), do the same renaming; the body will be ported in Task 13.

- [ ] **Step 3: Confirm error count drops**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
```

Expected: lower than 475. Don't fix anything else here — move on.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix(canvas): split Dims vs View in layer/overlay signatures"
```

---

## Task 3: Quick API-surface fixes — `alwaysOn`, `modifier`, `NodeId` brands

**Files:**
- Modify: `src/canvas/CanvasNewPrototype.tsx` (drop `alwaysOn:` from `useTools` options)
- Modify: `src/canvas/tools/useFillTrayTool.ts` (drop `modifier:` from `Tool<>` config)
- Modify: `src/components/App.tsx:108` (`NodeId` brand)
- Modify: `src/store/gardenStore.test.ts:641,673` (`NodeId` brand)
- Modify: `src/canvas/adapters/areaSelect.test.ts:43` (`NodeId` brand)

- [ ] **Step 1: Drop the removed props**

In `src/canvas/CanvasNewPrototype.tsx` find the `useTools({...})` (or similar) call near line 389 and delete the `alwaysOn:` line. The behavior is unchanged — `alwaysOn` is now per-layer (which we already set on the layer descriptors).

In `src/canvas/tools/useFillTrayTool.ts` find the `Tool<FillTrayScratch>` literal near line 27 and delete the `modifier:` line. If the tool relied on it, it has to gate inside its handler instead — for `useFillTrayTool` the modifier guard is trivial; inline a `ctx.modifiers.alt` check at the top of `onPointerDown`.

- [ ] **Step 2: Fix `NodeId` brand mismatches**

Each spot is feeding a plain `string` (or `string[]`) where `NodeId` is required. The fix is `asNodeId(s)` from weasel:

```ts
import { asNodeId } from '@orochi235/weasel';
// before:  setSelection(['root']);
// after:   setSelection([asNodeId('root')]);
```

Apply at each error site. For test files seeding store state, the same idiom.

- [ ] **Step 3: Verify**

```bash
npx tsc -b 2>&1 | grep -E "(alwaysOn|modifier|NodeId)" | wc -l
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix: drop removed alwaysOn/modifier props; brand NodeId at boundaries"
```

---

## Task 4: Verify `viewToMat3` reachability + create local fallback if needed

**Files:**
- Conditional create: `src/canvas/util/viewToMat3Local.ts`

The spec assumes `viewToMat3(view): Mat3` is importable from `@orochi235/weasel`. The export list grepped at plan time did NOT show it, but the docstring on `RenderLayer.draw` explicitly references it. Verify before any layer port.

- [ ] **Step 1: Try the import**

Add a temporary file `src/canvas/_probe.ts`:

```ts
import { viewToMat3 } from '@orochi235/weasel';
const _m = viewToMat3({ x: 0, y: 0, scale: 1 });
console.log(_m);
```

Run: `npx tsc --noEmit src/canvas/_probe.ts`

- [ ] **Step 2A (if import succeeds): Delete the probe and proceed**

```bash
rm src/canvas/_probe.ts
```

Subsequent layer tasks import `viewToMat3` from `@orochi235/weasel` directly.

- [ ] **Step 2B (if import fails — "no exported member 'viewToMat3'"): Write a local fallback**

```bash
rm src/canvas/_probe.ts
mkdir -p src/canvas/util
```

Create `src/canvas/util/viewToMat3Local.ts`:

```ts
import type { View } from '@orochi235/weasel';

/**
 * Local replacement for weasel's internal viewToMat3 (not in 0.2.0 public API).
 * Column-major 3×3: maps world coords → screen pixels using the camera-position
 * View semantics (view.x/y is the world point at canvas origin).
 */
export function viewToMat3(view: View): [number, number, number, number, number, number, number, number, number] {
  const s = view.scale;
  return [
    s, 0, 0,
    0, s, 0,
    -view.x * s, -view.y * s, 1,
  ];
}
```

Subsequent layer tasks import `viewToMat3` from `../util/viewToMat3Local` (adjust relative path per file location).

- [ ] **Step 3: Commit (only if Step 2B ran)**

```bash
git add src/canvas/util/viewToMat3Local.ts
git commit -m "feat(canvas): local viewToMat3 fallback (weasel 0.2.0 omits public export)"
```

---

## Task 5: Rewrite `src/canvas/patterns.ts` on `TextureHandle`

**Files:**
- Modify: `src/canvas/patterns.ts` (full rewrite)

- [ ] **Step 1: Read the current file to preserve cache key + defaults**

Open `src/canvas/patterns.ts` — copy out the `DEFAULTS`, `PatternId`, `PatternParamMap`, and `PatternOptions` types. They stay.

- [ ] **Step 2: Replace contents**

Overwrite `src/canvas/patterns.ts` with:

```ts
/**
 * Garden-side pattern overlay helper.
 *
 * Wraps weasel's `patterns-builtin` factories with garden's palette defaults
 * and exposes `getPattern` (returns a TextureHandle) + `paintFor`
 * (returns a ready-to-use Paint). Cache keyed by id+params so each unique
 * tile is registered exactly once with the renderer.
 */

import { hatch, crosshatch, dots, chunks } from '@orochi235/weasel/patterns-builtin';
import type { Paint, TextureHandle } from '@orochi235/weasel';

export type PatternId = 'hatch' | 'crosshatch' | 'dots' | 'chunks';

export interface PatternParamMap {
  hatch: { color?: string; size?: number; lineWidth?: number };
  crosshatch: { color?: string; size?: number; lineWidth?: number };
  dots: { color?: string; size?: number; radius?: number };
  chunks: { color?: string; bg?: string; size?: number; density?: number; chunkSize?: number; seed?: number };
}

const DEFAULTS = {
  hatch: { color: 'goldenrod', size: 5, lineWidth: 1 },
  crosshatch: { color: '#E03030', size: 6, lineWidth: 0.8 },
  dots: { color: 'goldenrod', size: 6, radius: 1 },
  chunks: { color: '#ffffff', bg: '#2e2218', size: 88, density: 0.1, chunkSize: 1.5, seed: 134 },
} as const;

const cache = new Map<string, TextureHandle | null>();

function keyOf(id: PatternId, p: Record<string, unknown>): string {
  return `${id}:${Object.keys(p).sort().map((k) => `${k}=${String(p[k])}`).join(',')}`;
}

function build(id: PatternId, params: Record<string, unknown>): TextureHandle | null {
  const k = keyOf(id, params);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let pat: TextureHandle | null;
  switch (id) {
    case 'hatch': pat = hatch(params as PatternParamMap['hatch'] & { color: string }); break;
    case 'crosshatch': pat = crosshatch(params as PatternParamMap['crosshatch'] & { color: string }); break;
    case 'dots': pat = dots(params as PatternParamMap['dots'] & { color: string }); break;
    case 'chunks': pat = chunks(params as PatternParamMap['chunks'] & { color: string }); break;
  }
  cache.set(k, pat);
  return pat;
}

export function getPattern<P extends PatternId>(
  id: P,
  params: Partial<PatternParamMap[P]> = {},
): TextureHandle | null {
  const merged = { ...DEFAULTS[id], ...params } as Record<string, unknown>;
  return build(id, merged);
}

export function paintFor<P extends PatternId>(
  id: P,
  params: Partial<PatternParamMap[P]> = {},
  opacity?: number,
): Paint {
  const handle = getPattern(id, params);
  return handle
    ? { fill: 'pattern', pattern: handle, opacity }
    : { fill: 'solid', color: 'transparent' };
}
```

- [ ] **Step 3: Typecheck just this file**

```bash
npx tsc --noEmit 2>&1 | grep "patterns.ts"
```

Expected: empty. If you get "Argument of type 'X' not assignable to parameter of type 'Y'" on the `hatch(...)`/`dots(...)` calls, the new built-in signature may differ slightly from the spec — open `node_modules/@orochi235/weasel/dist/patterns-builtin.d.ts` and adjust the cast on each call site to match the actual `TilePatternOpts` shape.

- [ ] **Step 4: Run tests for files that import this module**

```bash
npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL).*patterns" | head
```

Expected: existing tests (if any) still pass. There are no direct unit tests for `patterns.ts` — its callers in the layer port will exercise it.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/patterns.ts
git commit -m "refactor(patterns): rebuild on TextureHandle for weasel 0.2.0"
```

---

## Task 6: Port `src/canvas/layers/systemLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/systemLayersWorld.ts`
- (no colocated test file — skip triage step)

This is the smallest layer (53 lines, one draw block — origin crosshair). Use it as the reference port for the idiom in subsequent tasks.

- [ ] **Step 1: Note current errors for this file**

```bash
npx tsc -b 2>&1 | grep "systemLayersWorld" | wc -l
```

Note the count.

- [ ] **Step 2: Rewrite the `createOriginLayer` function**

Open `src/canvas/layers/systemLayersWorld.ts`. Current `createOriginLayer` is `space: 'screen'`, which means it should emit screen-pixel coords directly. The current body computes `ox = (0 - view.x) * view.scale; oy = (0 - view.y) * view.scale` — that's already screen-space, so the port is just a translation:

Replace lines 22-42 (the function body) with:

```ts
function createOriginLayer(meta: LayerDescriptor): RenderLayer<unknown> {
  return {
    ...meta,
    space: 'screen',
    draw(_data, view, _dims): DrawCommand[] {
      const ox = (0 - view.x) * view.scale;
      const oy = (0 - view.y) * view.scale;
      const r = 4;
      const stroke = { paint: { fill: 'solid' as const, color: 'rgba(0,0,0,0.3)' }, width: 1 };
      // two short orthogonal segments forming a crosshair
      return [
        {
          kind: 'path',
          path: polygonFromPoints([{ x: ox - r, y: oy }, { x: ox + r, y: oy }], { closed: false }),
          stroke,
        },
        {
          kind: 'path',
          path: polygonFromPoints([{ x: ox, y: oy - r }, { x: ox, y: oy + r }], { closed: false }),
          stroke,
        },
      ];
    },
  };
}
```

Update the imports at the top:

```ts
import { type RenderLayer, type DrawCommand, polygonFromPoints } from '@orochi235/weasel';
```

(If the polygon doesn't render as a stroke because `polygonFromPoints` requires `closed: true`, fall back to building two `PathBuilder` instances: `new PathBuilder().moveTo(ox-r, oy).lineTo(ox+r, oy).build()`.)

- [ ] **Step 3: Verify**

```bash
npx tsc -b 2>&1 | grep "systemLayersWorld"
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/canvas/layers/systemLayersWorld.ts
git commit -m "port(layers): systemLayersWorld → DrawCommand"
```

---

## Task 7: Port `src/canvas/layers/debugLayers.ts`

**Files:**
- Modify: `src/canvas/layers/debugLayers.ts` (~157 lines, 5 layers: axes, grid, panel, etc.)
- Modify or delete: `src/canvas/layers/debugLayers.test.ts` per triage rule

- [ ] **Step 1: Read the test file and triage**

```bash
cat src/canvas/layers/debugLayers.test.ts
```

Classify each `it(...)`. If all are `expect(ctx.*)` rendering assertions, plan to delete the file. If any test factory creation, descriptor metadata, or layer ordering, keep those.

- [ ] **Step 2: Port each layer's `draw`**

Walk through each `RenderLayer` factory in the file. For each `draw(ctx, _data, view: View)` block, apply the layer-port idiom from the top of this plan:
- Rename signature to `draw(_data, view, dims): DrawCommand[]`.
- Convert imperative ctx calls to DrawCommands using the cheat sheet.
- World-space layers wrap in `{ kind: 'group', transform: viewToMat3(view), children }`. Screen-space (look at `space: 'screen'`) emit screen coords directly.
- Where the old code used `view.scale`/`view.x`/`view.y` on what's now `Dims`, switch to reading them from `view` (the second arg).

Add imports:

```ts
import { viewToMat3, rectPath, polygonFromPoints, PathBuilder, type DrawCommand, type RenderLayer } from '@orochi235/weasel';
// or from '../util/viewToMat3Local' if Task 4 took the fallback path
```

- [ ] **Step 3: Apply test triage**

Per the rule at the top of this plan: delete pure-rendering `it` blocks; keep behavior. Save as `debugLayers.test.ts` (or delete entirely if empty).

- [ ] **Step 4: Verify**

```bash
npx tsc -b 2>&1 | grep "debugLayers"
npx vitest run src/canvas/layers/debugLayers.test.ts 2>&1 | tail -5
```

Expected: tsc empty for this file; vitest green (or no tests).

- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/debugLayers.ts src/canvas/layers/debugLayers.test.ts
git commit -m "port(layers): debugLayers → DrawCommand; trim ctx-mock tests"
```

If you deleted the test file: include `git rm` and note in commit body which tests were removed and why ("rendering assertions, covered by visual regression").

---

## Task 8: Port `src/canvas/layers/zoneLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/zoneLayersWorld.ts` (~95 lines, 4 layers per descriptor)
- Modify or delete: `src/canvas/layers/zoneLayersWorld.test.ts` per triage rule

- [ ] **Step 1: Triage the test file** (same procedure as Task 7 Step 1)

- [ ] **Step 2: Port each `draw` block** using the idiom

Look for any pattern fills (zones use the hatch/dots overlays). Replace `renderPatternOverlay(ctx, id, region, opts)` calls with a `PathDrawCommand` whose `fill` comes from the new `paintFor(id, params, opacity)` in `../patterns`:

```ts
import { paintFor } from '../patterns';
// ...
return [{ kind: 'path', path: <region as Path>, fill: paintFor('hatch', { color: '#abc' }, 0.5) }];
```

If the `region` was a `Region` (weasel type — still preserved per spec), convert it to a `Path` via the appropriate helper (`rectPath` for axis-aligned, `polygonFromPoints` for arbitrary; `composePath` for nested).

- [ ] **Step 3: Apply test triage** (same as Task 7 Step 3)

- [ ] **Step 4: Verify**

```bash
npx tsc -b 2>&1 | grep "zoneLayersWorld"
npx vitest run src/canvas/layers/zoneLayersWorld.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/zoneLayersWorld.ts src/canvas/layers/zoneLayersWorld.test.ts
git commit -m "port(layers): zoneLayersWorld → DrawCommand"
```

---

## Task 9: Port `src/canvas/layers/trayLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/trayLayersWorld.ts` (~163 lines)
- Modify or delete: `src/canvas/layers/trayLayersWorld.test.ts`

Same procedure as Tasks 7-8. Per-step:

- [ ] **Step 1: Triage `trayLayersWorld.test.ts`**
- [ ] **Step 2: Port each `draw` block** using the idiom + cheat sheet. The tray layer renders cell grids — express grid lines as polylines via `PathBuilder` (one per row/col), or as a single `kind: 'path'` with stroke.
- [ ] **Step 3: Apply test triage**
- [ ] **Step 4: `npx tsc -b 2>&1 | grep trayLayersWorld` empty; `npx vitest run src/canvas/layers/trayLayersWorld.test.ts` green**
- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/trayLayersWorld.ts src/canvas/layers/trayLayersWorld.test.ts
git commit -m "port(layers): trayLayersWorld → DrawCommand"
```

---

## Task 10: Port `src/canvas/layers/structureLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/structureLayersWorld.ts` (~435 lines, 6 draw blocks)
- Modify or delete: `src/canvas/layers/structureLayersWorld.test.ts`

Largest non-planting layer file. Same procedure:

- [ ] **Step 1: Triage `structureLayersWorld.test.ts`**
- [ ] **Step 2: Port each `draw` block.** Structures often have rotated rects — use `rectPath` inside a `kind: 'group'` whose `transform` is rotate+translate (compose your own Mat3 or use the cheat sheet's `tx,ty` form for translate). For text labels on structures, use `kind: 'text'` (font must be registered — the app already calls `registerFont` somewhere; verify in `App.tsx` startup; if not, add `registerFont('inter', '/fonts/inter.json')` once at app boot and ship the atlas from `node_modules/@orochi235/weasel/dist/fonts/`).
- [ ] **Step 3: Apply test triage**
- [ ] **Step 4: `npx tsc -b 2>&1 | grep structureLayersWorld` empty; vitest green**
- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/structureLayersWorld.ts src/canvas/layers/structureLayersWorld.test.ts
git commit -m "port(layers): structureLayersWorld → DrawCommand"
```

---

## Task 11: Port `src/canvas/layers/seedlingLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/seedlingLayersWorld.ts` (~252 lines)
- Modify or delete: `src/canvas/layers/seedlingLayersWorld.test.ts`

- [ ] **Step 1: Triage** the test file
- [ ] **Step 2: Port** each `draw` block using the idiom. Seedlings render an icon image — use `kind: 'image'` with `image: ImageBitmap`. The current code likely uses `ctx.drawImage(htmlImage, x, y, w, h)`. Convert HTML images to `ImageBitmap` once at load (e.g. via `createImageBitmap(img)`) and cache; ImageDrawCommand emits screen-space coords, so for world-space placement wrap in the standard world-to-screen group.
- [ ] **Step 3: Apply test triage**
- [ ] **Step 4: Verify** (`tsc` empty for file, vitest green)
- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/seedlingLayersWorld.ts src/canvas/layers/seedlingLayersWorld.test.ts
git commit -m "port(layers): seedlingLayersWorld → DrawCommand"
```

---

## Task 12: Port `src/canvas/layers/plantingLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/plantingLayersWorld.ts` (~407 lines, largest layer file; multiple draw blocks; uses patterns)
- Modify or delete: `src/canvas/layers/plantingLayersWorld.test.ts`

This is the first heavy consumer of the new `paintFor()` from `../patterns`.

- [ ] **Step 1: Triage** the test file
- [ ] **Step 2: Port each `draw` block** using the idiom + cheat sheet. Replace every old-API call:
  - `renderPatternOverlay(ctx, ...)` → `{ kind: 'path', path, fill: paintFor(id, params, opacity) }`
  - Per-vertex coloring (planting heatmaps if present) → `vertexColors?: number[]` on a `PathDrawCommand` with a placeholder solid fill (per the docstring on `PathDrawCommand`)
- [ ] **Step 3: Apply test triage**
- [ ] **Step 4: Verify** (`tsc` empty for file, vitest green)
- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/plantingLayersWorld.ts src/canvas/layers/plantingLayersWorld.test.ts
git commit -m "port(layers): plantingLayersWorld → DrawCommand (consumes new patterns)"
```

---

## Task 13: Port `src/canvas/layers/selectionLayersWorld.ts`

**Files:**
- Modify: `src/canvas/layers/selectionLayersWorld.ts` (~343 lines, depends on selection-overlay primitives)
- Modify or delete: `src/canvas/layers/selectionLayersWorld.test.ts`

Selection layers render outlines + handles. Weasel exports `createSelectionOverlayLayer`, `createSelectionOutlineLayer`, `createSelectionHandlesLayer`. Where the eric layer can delegate to one of these built-ins, do so — don't reimplement. Where it can't (custom selection visuals), port using the idiom.

- [ ] **Step 1: Triage** the test file
- [ ] **Step 2: For each `draw` block, decide: delegate to built-in or hand-port?** Built-ins: `createSelectionOutlineLayer({ ... })` returns a `RenderLayer` you can wrap or re-export with eric's specific descriptor. Hand-port: idiom + cheat sheet.
- [ ] **Step 3: Apply test triage**
- [ ] **Step 4: Verify** (`tsc` empty for file, vitest green)
- [ ] **Step 5: Commit**

```bash
git add src/canvas/layers/selectionLayersWorld.ts src/canvas/layers/selectionLayersWorld.test.ts
git commit -m "port(layers): selectionLayersWorld → DrawCommand"
```

---

## Task 14: Port `src/canvas/drag/dragPreviewLayer.ts`

**Files:**
- Modify: `src/canvas/drag/dragPreviewLayer.ts` (31 lines)

Tiny — same idiom.

- [ ] **Step 1: Apply the layer-port idiom**

Convert the single `draw` block. This layer is presumably world-space (drag preview follows the dragged object); wrap in the standard view-group.

- [ ] **Step 2: Verify**

```bash
npx tsc -b 2>&1 | grep "dragPreviewLayer"
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/canvas/drag/dragPreviewLayer.ts
git commit -m "port(canvas): dragPreviewLayer → DrawCommand"
```

---

## Task 15: Port tool overlay — `src/canvas/tools/useEricSelectTool.ts`

**Files:**
- Modify: `src/canvas/tools/useEricSelectTool.ts` (617 lines; overlay block near line 322; has WIP changes from main)
- Modify: `src/canvas/tools/useEricSelectTool.test.ts`

- [ ] **Step 1: Find the overlay block**

```bash
grep -n "draw(ctx\|drawGhostGL\|drawOneGL" src/canvas/tools/useEricSelectTool.ts
```

- [ ] **Step 2: Port the overlay's `draw`** using the layer-port idiom. Rename any `drawGhostGL`/`drawOneGL`/`drawChildGL` to their new names (`drawGhost`/`drawOne`/`drawChild`).

- [ ] **Step 3: Triage and update the test file** per the rule

- [ ] **Step 4: Verify**

```bash
npx tsc -b 2>&1 | grep "useEricSelectTool"
npx vitest run src/canvas/tools/useEricSelectTool.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "port(tools): useEricSelectTool overlay → DrawCommand; rename GL suffixes"
```

---

## Task 16: Port tool overlays — `useSeedlingMoveTool`, `useEricCycleTool`, `useFillTrayTool`

**Files:**
- Modify: `src/canvas/tools/useSeedlingMoveTool.ts` (526 lines; overlay near line 130)
- Modify: `src/canvas/tools/useSeedlingMoveTool.test.ts`
- Modify: `src/canvas/tools/useEricCycleTool.ts` (163 lines)
- Modify: `src/canvas/tools/useEricCycleTool.test.ts`
- Modify: `src/canvas/tools/useFillTrayTool.ts` (108 lines)

For each file in turn, repeat the same per-file procedure as Task 15:

- [ ] **Step 1: `useSeedlingMoveTool` overlay port + test triage + commit**

```bash
git add src/canvas/tools/useSeedlingMoveTool.ts src/canvas/tools/useSeedlingMoveTool.test.ts
git commit -m "port(tools): useSeedlingMoveTool overlay → DrawCommand"
```

- [ ] **Step 2: `useEricCycleTool` overlay port + test triage + commit**

```bash
git add src/canvas/tools/useEricCycleTool.ts src/canvas/tools/useEricCycleTool.test.ts
git commit -m "port(tools): useEricCycleTool overlay → DrawCommand"
```

- [ ] **Step 3: `useFillTrayTool` overlay port + commit**

```bash
git add src/canvas/tools/useFillTrayTool.ts
git commit -m "port(tools): useFillTrayTool overlay → DrawCommand"
```

After all three: `npx tsc -b 2>&1 | grep -E "(useSeedlingMoveTool|useEricCycleTool|useFillTrayTool)" | wc -l` should be `0`.

---

## Task 17: Rebuild `usePaletteDropTool` on `defineDragInsertTool`

**Files:**
- Modify: `src/canvas/tools/usePaletteDropTool.ts` (156 lines; uses deleted `createDragGhost`)

`createDragGhost` is gone. Weasel exports `defineDragInsertTool` + `DragInsertToolConfig` for this exact use case.

- [ ] **Step 1: Read weasel's drag-insert API**

```bash
grep -B2 -A30 "defineDragInsertTool\|DragInsertToolConfig" /Users/mike/src/weasel/dist/index.d.ts | head -80
```

Note the config shape: it expects an `onInsert` callback, a `previewLayer` factory or `drawGhost` function, and pointer-event hooks.

- [ ] **Step 2: Replace the two `createDragGhost` blocks**

The current file has two pointer-down branches that each construct a ghost. Both should:
- Build a `defineDragInsertTool({...})` config that delegates to `usePaletteDropTool`'s existing logic for hit-testing the drop target and dispatching the insert.
- The ghost render becomes a `drawGhost` function returning `DrawCommand[]` for the dragged item — same idiom as the layer port.

If `defineDragInsertTool` is too opinionated for the palette drop UX (e.g. requires a specific drag-source contract that the palette can't satisfy), fall back: implement a custom `RenderLayer<DragState>` whose data is the in-flight drag pose, and feed it from a ref the pointer handlers update.

- [ ] **Step 3: Verify**

```bash
npx tsc -b 2>&1 | grep "usePaletteDropTool"
npx vitest run src/canvas/tools/usePaletteDropTool.test.ts 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/canvas/tools/usePaletteDropTool.ts src/canvas/tools/usePaletteDropTool.test.ts
git commit -m "port(tools): usePaletteDropTool — rebuild ghost on defineDragInsertTool"
```

---

## Task 18: Rebuild `useGardenPaletteDropTool` on `defineDragInsertTool`

**Files:**
- Modify: `src/canvas/tools/useGardenPaletteDropTool.ts` (267 lines; two `createDragGhost` call sites)

Mirror Task 17. Same procedure, same fallback strategy.

- [ ] **Step 1: Replace both `createDragGhost` blocks** with `defineDragInsertTool` configs (or custom-layer fallback)
- [ ] **Step 2: Verify** (`npx tsc -b 2>&1 | grep useGardenPaletteDropTool` empty; vitest green)
- [ ] **Step 3: Commit**

```bash
git add src/canvas/tools/useGardenPaletteDropTool.ts src/canvas/tools/useGardenPaletteDropTool.test.ts
git commit -m "port(tools): useGardenPaletteDropTool — rebuild ghost on defineDragInsertTool"
```

---

## Task 19: Final canvas/component cleanup pass

**Files:**
- Modify: `src/canvas/CanvasNewPrototype.tsx`
- Modify: `src/canvas/SeedStartingCanvasNewPrototype.tsx`
- Any remaining file that `tsc` still flags

- [ ] **Step 1: Identify remaining errors**

```bash
npx tsc -b 2>&1 | grep "error TS" | sed -E 's/^([^(]+)\(.*$/\1/' | sort -u
```

For each surviving file, fix the specific error. Common ones now: prop renames (`Canvas`/`SceneCanvas` no longer takes `backend`); registry calls that referenced deleted exports; minor type drift.

- [ ] **Step 2: Verify clean typecheck**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: green. If any tests still mock ctx and assert on it, apply the triage rule (delete pure-rendering tests; preserve behavior).

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix: final canvas component cleanup; tsc + vitest green"
```

---

## Task 20: Manual smoke test in browser

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Visit `http://localhost:5173`. Confirm: garden canvas renders; you can pan/zoom; you can place a planting via the palette; you can switch to seed-starting mode and see a tray; you can drag a seedling.

- [ ] **Step 2: Note any visual regressions**

If anything looks broken (missing layer, wrong color, misplaced text, etc.), fix it now. The visual rig (next tasks) will catch what you miss, but don't bake a broken baseline.

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: smoke-test regressions in <area>"
```

---

## Task 21: Add Playwright + pixelmatch as devDeps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install --save-dev @playwright/test pixelmatch pngjs @types/pixelmatch @types/pngjs
npx playwright install chromium
```

- [ ] **Step 2: Add scripts to `package.json`**

In the `"scripts"` object add:

```json
"test:visual": "playwright test --config tests/visual/visual.config.ts",
"test:visual:update": "playwright test --config tests/visual/visual.config.ts --update-snapshots"
```

(The `--update-snapshots` flag is a Playwright convention; our spec uses pixelmatch and reads/writes baselines explicitly — see Task 24. The script alias is convention only.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Playwright + pixelmatch for visual regression"
```

---

## Task 22: Build the dev-only fixture loader

**Files:**
- Create: `src/dev/fixtureLoader.ts`
- Modify: `src/components/App.tsx` (call loader before first render)

- [ ] **Step 1: Write the failing integration test**

Create `src/dev/fixtureLoader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFixtureFromUrl } from './fixtureLoader';
import { useGardenStore } from '../store/gardenStore';

describe('loadFixtureFromUrl', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns false when no ?fixture param', async () => {
    const r = await loadFixtureFromUrl(new URL('http://localhost/'));
    expect(r).toBe(false);
  });

  it('hydrates the garden store from the fetched JSON', async () => {
    const fakeGarden = { version: 1, name: 'Test', widthFt: 10, lengthFt: 10, structures: [], zones: [], plantings: [], seedStarting: { trays: [] } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fakeGarden),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const r = await loadFixtureFromUrl(new URL('http://localhost/?fixture=test-fixture'));
    expect(r).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/tests/visual/fixtures/test-fixture.garden');
    expect(useGardenStore.getState().garden.name).toBe('Test');
  });
});
```

Run: `npx vitest run src/dev/fixtureLoader.test.ts` — expected: FAIL (file doesn't exist).

- [ ] **Step 2: Implement the loader**

Create `src/dev/fixtureLoader.ts`:

```ts
/**
 * Dev-only fixture loader for visual regression and quick repro.
 *
 * If the URL contains `?fixture=<name>`, fetches
 * `/tests/visual/fixtures/<name>.garden`, parses via `deserializeGarden`,
 * and replaces the current garden in `useGardenStore`. Returns true if a
 * fixture was loaded (caller may want to skip auto-restore from autosave).
 *
 * Gated on `import.meta.env.DEV` so the production bundle short-circuits.
 */

import { deserializeGarden } from '../utils/file';
import { useGardenStore } from '../store/gardenStore';

export async function loadFixtureFromUrl(url: URL = new URL(window.location.href)): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const name = url.searchParams.get('fixture');
  if (!name) return false;
  const safe = /^[a-z0-9-]+$/.test(name);
  if (!safe) {
    console.warn(`[fixtureLoader] rejecting unsafe fixture name: ${name}`);
    return false;
  }
  const res = await fetch(`/tests/visual/fixtures/${name}.garden`);
  if (!res.ok) {
    console.warn(`[fixtureLoader] fixture not found: ${name}`);
    return false;
  }
  const json = await res.text();
  const garden = deserializeGarden(json);
  useGardenStore.setState({ garden });
  return true;
}
```

- [ ] **Step 3: Wire into `App.tsx`**

At the top of `src/components/App.tsx`, add:

```ts
import { loadFixtureFromUrl } from '../dev/fixtureLoader';
```

Inside the component (before the canvas mounts — wrap with a `useState`/`useEffect` gate so render holds until either the fixture loads or there's no fixture):

```ts
const [fixtureReady, setFixtureReady] = useState<boolean>(import.meta.env.PROD);
useEffect(() => {
  if (import.meta.env.PROD) return;
  loadFixtureFromUrl().finally(() => setFixtureReady(true));
}, []);
if (!fixtureReady) return null;
```

If `App.tsx` already has gating logic for autosave restore, integrate there instead — don't double-render.

- [ ] **Step 4: Tests pass**

```bash
npx vitest run src/dev/fixtureLoader.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dev/fixtureLoader.ts src/dev/fixtureLoader.test.ts src/components/App.tsx
git commit -m "feat(dev): ?fixture URL loader for visual regression hydration"
```

---

## Task 23: Add the `data-canvas-ready` first-paint signal

**Files:**
- Modify: `src/canvas/CanvasNewPrototype.tsx`
- Modify: `src/canvas/SeedStartingCanvasNewPrototype.tsx`

The Playwright spec needs a deterministic "first paint complete" signal so screenshots aren't taken before the GL renderer has drawn frame 1.

- [ ] **Step 1: Wire the attribute**

In each canvas component, after the underlying weasel `<Canvas>` or `<SceneCanvas>` reports it has rendered (use the `onAfterRender` / `onReady` callback if weasel exposes one; otherwise a `requestAnimationFrame` fallback after mount), set a state flag and stamp the wrapper div:

```tsx
const [ready, setReady] = useState(false);
// onReady or first rAF:
useEffect(() => { requestAnimationFrame(() => setReady(true)); }, []);
return <div data-canvas-ready={ready ? 'true' : 'false'}>...</div>
```

- [ ] **Step 2: Manual verify**

`npm run dev`, open devtools, inspect the canvas wrapper — confirm the attribute flips to `'true'` after the first frame.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "feat(canvas): data-canvas-ready signal for visual regression"
```

---

## Task 24: Author fixture JSON files

**Files:**
- Create: `tests/visual/fixtures/garden-empty.garden`
- Create: `tests/visual/fixtures/garden-mixed.garden`
- Create: `tests/visual/fixtures/garden-mixed-selected.garden`
- Create: `tests/visual/fixtures/garden-zoomed-in.garden`
- Create: `tests/visual/fixtures/seed-empty.garden`
- Create: `tests/visual/fixtures/seed-with-seedlings.garden`
- Create: `tests/visual/fixtures/seed-sown-cells.garden`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p tests/visual/fixtures tests/visual/baselines
```

- [ ] **Step 2: Build each scene in the running app and export**

For each fixture name, in `npm run dev`:
1. Start fresh ("New Garden" or clear autosave)
2. Build the scene per the spec's fixture descriptions:
   - `garden-empty` — blank
   - `garden-mixed` — 2 zones, 1 structure, 6 plantings spanning grid kinds
   - `garden-mixed-selected` — same scene, then click one planting
   - `garden-zoomed-in` — same scene, zoom to 3×
   - `seed-empty` — switch to seed-starting mode, blank
   - `seed-with-seedlings` — multiple seedlings placed
   - `seed-sown-cells` — sown cells with seedling overlays
3. File → Download Garden (existing `downloadGarden` flow)
4. Move the downloaded `.garden` into `tests/visual/fixtures/<fixture-name>.garden`

Selection state and view state must be part of what's serialized — verify by reloading the fixture URL and confirming the same view.

If selection/view aren't currently serialized in `Garden`, you'll need to extend the JSON schema first. Quick check:

```bash
grep -n "selection\|view\|zoom" src/utils/file.ts src/store/gardenStore.ts | head
```

If missing, add an optional `_devState?: { selection?: NodeId[]; view?: View }` field to the serialized shape and rehydrate in `loadFixtureFromUrl`. Keep the field optional so it doesn't pollute user-saved gardens.

- [ ] **Step 3: Verify each fixture loads**

```bash
npm run dev
```

Visit `http://localhost:5173/?fixture=garden-mixed` and confirm the scene appears as authored. Repeat for each fixture name.

- [ ] **Step 4: Commit**

```bash
git add tests/visual/fixtures/
git commit -m "test(visual): author fixture scenes for regression baselines"
```

---

## Task 25: Write the Playwright spec + config

**Files:**
- Create: `tests/visual/visual.config.ts`
- Create: `tests/visual/visual.spec.ts`
- Create: `tests/visual/README.md`

- [ ] **Step 1: Write the config**

Create `tests/visual/visual.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  workers: 1,
  reporter: [['list']],
});
```

- [ ] **Step 2: Write the spec**

Create `tests/visual/visual.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const FIXTURES = [
  'garden-empty',
  'garden-mixed',
  'garden-mixed-selected',
  'garden-zoomed-in',
  'seed-empty',
  'seed-with-seedlings',
  'seed-sown-cells',
];

const BASELINE_DIR = path.join(__dirname, 'baselines');
const DIFF_DIR = path.join(__dirname, 'diffs');
const PIXEL_THRESHOLD = 0.1;       // per-pixel YIQ distance
const FAIL_RATIO = 0.02;           // 2% pixels differing → fail

for (const name of FIXTURES) {
  test(`fixture: ${name}`, async ({ page }) => {
    await page.goto(`/?fixture=${name}`);
    await page.waitForSelector('[data-canvas-ready="true"]', { timeout: 10_000 });
    const canvas = await page.locator('canvas').first();
    const actualBuf = await canvas.screenshot();
    const baselinePath = path.join(BASELINE_DIR, `${name}.png`);

    if (!fs.existsSync(baselinePath)) {
      // First run / new fixture — write baseline and skip
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(baselinePath, actualBuf);
      test.skip(true, `Baseline created at ${baselinePath}; re-run to compare.`);
      return;
    }

    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const actual = PNG.sync.read(actualBuf);
    expect(actual.width, 'actual width').toBe(baseline.width);
    expect(actual.height, 'actual height').toBe(baseline.height);

    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const numDiff = pixelmatch(
      baseline.data, actual.data, diff.data,
      baseline.width, baseline.height,
      { threshold: PIXEL_THRESHOLD },
    );
    const ratio = numDiff / (baseline.width * baseline.height);
    if (ratio > FAIL_RATIO) {
      fs.mkdirSync(DIFF_DIR, { recursive: true });
      fs.writeFileSync(path.join(DIFF_DIR, `${name}.diff.png`), PNG.sync.write(diff));
      fs.writeFileSync(path.join(DIFF_DIR, `${name}.actual.png`), actualBuf);
    }
    expect(ratio, `pixel diff ratio for ${name}`).toBeLessThanOrEqual(FAIL_RATIO);
  });
}
```

- [ ] **Step 3: Write the README**

Create `tests/visual/README.md` with a paragraph each on: what the rig covers, how to run it, how to update baselines, where diffs land, and the pinned Playwright version (read from `package.json`).

- [ ] **Step 4: First run (creates baselines)**

```bash
npm run test:visual
```

Expected: each test SKIPs after writing its baseline. Inspect `tests/visual/baselines/*.png` — they should look like the dev-server scenes.

- [ ] **Step 5: Second run (compares against fresh baselines)**

```bash
npm run test:visual
```

Expected: all 7 PASS.

- [ ] **Step 6: Commit spec, config, README, and baselines**

```bash
git add tests/visual/visual.config.ts tests/visual/visual.spec.ts tests/visual/README.md tests/visual/baselines/
echo "tests/visual/diffs/" >> .gitignore
git add .gitignore
git commit -m "test(visual): Playwright + pixelmatch rig with 7 fixture baselines"
```

---

## Task 26: Final integration check

**Files:** none (verification + merge)

- [ ] **Step 1: Clean typecheck**

```bash
npx tsc -b 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 2: All unit tests green**

```bash
npm test
```

Expected: green.

- [ ] **Step 3: Visual regression green**

```bash
npm run test:visual
```

Expected: 7/7 PASS.

- [ ] **Step 4: Lint clean**

```bash
npm run lint
```

Expected: green (or only pre-existing warnings).

- [ ] **Step 5: Build clean**

```bash
npm run build
```

Expected: clean dist output, no fixture loader code in the production bundle (grep `dist/assets/*.js` for `loadFixtureFromUrl` — should be tree-shaken because of the `import.meta.env.PROD` guard).

- [ ] **Step 6: Branch ready for merge**

The branch `port/weasel-0.2` is now ready. Hand back to the user for review and merge — DO NOT auto-merge.

---

## Self-Review Notes (author's running checklist)

Spec coverage:
- ✓ Branch + WIP carry-over (Task 1)
- ✓ Quick API surface fixes (Tasks 2-3)
- ✓ patterns.ts rewrite (Task 5)
- ✓ All 8 layer ports (Tasks 6-13)
- ✓ Tool overlay rename + signature pass (Tasks 15-16)
- ✓ Drag-ghost rebuild (Tasks 17-18)
- ✓ Canvas component cleanup (Task 19)
- ✓ Visual rig (Tasks 21-25)
- ✓ Done definition matches spec §Done definition

Type consistency:
- `viewToMat3` either imported from `@orochi235/weasel` (Task 4 path A) or `../util/viewToMat3Local` (path B) — Task 4 picks one; subsequent tasks reference both options
- `paintFor(id, params, opacity)` — same signature in patterns.ts (Task 5) and consumer layers (Tasks 8, 12)
- `loadFixtureFromUrl(url?: URL): Promise<boolean>` — same in test (Task 22 step 1) and impl (step 2)

Risks called out in spec:
- ✓ Drag ghost rebuild has explicit fallback to custom RenderLayer (Tasks 17-18)
- ✓ Pattern parity at small zooms — visual regression catches it (Task 25)
- ✓ Test deletion gap — mitigation is "don't merge until baselines green" (Task 26)
