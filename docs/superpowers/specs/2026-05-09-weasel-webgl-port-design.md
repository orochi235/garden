# Port garden-planner to weasel 0.2.0 (WebGL2-only)

**Status:** approved (brainstorming) → ready for plan
**Date:** 2026-05-09
**Branch target:** `port/weasel-0.2`

## Problem

Weasel 0.2.0 removed the 2D backend, simplified `RenderLayer`, deleted several
exports, and rebuilt the patterns API on `TextureHandle`. The eric repo currently
has ~475 TypeScript errors across ~30 files. We need a full port to parity, plus
a visual-regression rig so we can be confident nothing rendered differently
after the swap.

This is intentionally a single port + parity push, not a phased migration.
There is no reason to keep the old 2D code path alive in the app: weasel
already deleted it.

## Non-goals

- No backend toggle. WebGL2 is the only path.
- No new features. Renderer correctness only.
- No CI for the visual rig (yet). Local-only.
- No rewrite of unrelated app code. Targeted in-the-area improvements only.

## Decisions captured during brainstorming

- Build on the WIP files already in the working tree
  (`plantingLayout.ts`, `plantingMove.ts`, `findSnapContainer.ts`,
  `useEricSelectTool.ts`).
- Full port + parity, single push.
- Visual regression: Playwright + pixelmatch, modeled on weasel's rig.
- Layer/tool tests: triage per-file. Keep behavior assertions; drop pure
  ctx-mock rendering assertions.
- Visual rig coverage: ~3-5 fixtures per surface (garden + seed-starting).
- Local-only rig.
- Fixture loading: JSON files loaded via `?fixture=<name>`, hydrated through
  the existing `deserializeGarden()` in `src/utils/file.ts`.

## API change map

| Cluster | Old | New | Where it bites |
|---|---|---|---|
| Layers | `RenderLayer.draw(ctx, data, view): void` (imperative ctx) | `draw(data, view, dims): DrawCommand[]` | 8 files in `src/canvas/layers/` |
| Tool overlays | `overlay.draw(ctx, …)` + `drawGhostGL` / `drawOneGL` / `drawChildGL` | Same new layer signature; suffixes dropped (`drawGhost`, `drawOne`, `drawChild`) | `useEricSelectTool`, `useSeedlingMoveTool`, `useEricCycleTool`, `useFillTrayTool`, `dragPreviewLayer` |
| Drag ghosts | `createDragGhost({...})` (deleted) | Rebuild on `defineDragInsertTool` (preferred) or a custom `RenderLayer` driven by ephemeral pointer state | `useGardenPaletteDropTool`, `usePaletteDropTool` |
| Patterns | `renderFilledRegion(ctx, paint, region)` + `hatch(ctx, opts)` returning `CanvasPattern` | `createTilePattern({size, draw})` returning `TextureHandle`; `Paint` `'pattern'` variant takes `TextureHandle`. No `renderFilledRegion` — emit a `PathDrawCommand` with `paint: { fill: 'pattern', pattern: handle }` | `src/canvas/patterns.ts` (rewrite) |
| `Dims` vs `View` | Some call sites passed `Dims` where `View` is required (or vice versa). | `View = { x, y, scale }`, `Dims = { width, height }` — keep them straight. | scattered |
| Misc | `alwaysOn` removed from `UseToolsOptions`; `modifier` removed from `Tool<>`; a few `NodeId` brand mismatches | drop the props; cast/wrap with `asNodeId` | `CanvasNewPrototype.tsx`, `useFillTrayTool.ts`, `App.tsx`, `gardenStore.test.ts` |

## Port order

Each step is a checkpoint that should reduce error count or unblock the next.

1. **Branch & WIP carry-over.** Stash, branch off `main` to `port/weasel-0.2`,
   pop the stash. Commit the WIP intact as the starting point.

2. **Quick API surface fixes.** Smallest, mechanical, highest error-count
   reduction per minute: `Dims`/`View` confusions, `alwaysOn`/`modifier`
   removal, `NodeId` brand mismatches.

3. **Rewrite `patterns.ts`.** Establishes the TextureHandle idiom that several
   layers will consume. New shape:
   - `getPattern(id, params): TextureHandle | null` — registers/caches the
     tile texture once via `createTilePattern({ size, draw })`.
   - `paintFor(id, params, opacity?): Paint` — convenience that returns a
     `Paint` with `fill: 'pattern'` and the handle.
   - Cache key stays the same shape (id + sorted params); cache value is now
     `TextureHandle | null`.
   - Built-ins move from `(ctx, opts)` calls to the new ctx-less signatures.

4. **Layer port, smallest first**, fixing colocated tests as you go (per the
   triage rule below):
   - `systemLayersWorld` (sets the conversion idiom)
   - `debugLayers`, `zoneLayersWorld`, `trayLayersWorld`
   - `structureLayersWorld`, `seedlingLayersWorld`
   - `plantingLayersWorld` (largest; first consumer of new patterns)
   - `selectionLayersWorld` (depends on shared selection-overlay primitives)

5. **Tool overlay rename + signature pass.** Rename `*GL` suffixes; convert
   overlay `draw(ctx, …)` to `draw(data, view, dims): DrawCommand[]` for
   `useEricSelectTool`, `useSeedlingMoveTool`, `useEricCycleTool`,
   `useFillTrayTool`, `dragPreviewLayer`.

6. **Drag-ghost rebuild.** Re-implement `usePaletteDropTool` and
   `useGardenPaletteDropTool` on `defineDragInsertTool`. If a call site needs
   behavior `defineDragInsertTool` doesn't cover, fall back to a custom
   `RenderLayer` whose data is the in-flight drag state.

7. **`CanvasNewPrototype` / `SeedStartingCanvasNewPrototype` cleanup.**
   Anything left after layers + tools — wiring, prop renames, removed `backend`
   prop. Delete dead branches.

8. **`npx tsc -b` clean, `npm test` green** with the new (surviving) tests.

9. **Stand up the visual-regression rig** (see §Visual rig).

10. **Capture baselines, commit them, run full pass, fix any deltas, commit.**

## Layer port pattern (concrete)

Old shape (illustrative):

```ts
{
  draw(ctx, _data, view) {
    ctx.fillStyle = '#444';
    ctx.fillRect(view.x, view.y, 100, 100);
  }
}
```

New shape:

```ts
{
  draw(_data, _view, _dims): DrawCommand[] {
    return [
      {
        kind: 'path',
        path: rectPath(0, 0, 100, 100),
        paint: { fill: 'solid', color: '#444' },
      },
    ];
  }
}
```

Notes for the porter:

- `ctx.fillRect(x, y, w, h)` → `{ kind: 'path', path: rectPath(x, y, w, h), paint: { fill: 'solid', color } }`.
- `ctx.beginPath()`/`moveTo`/`lineTo`/`fill` → build a `PolygonPath` or
  `composePath` and emit one `PathDrawCommand`.
- Stroke: same path command with a `stroke: { color, width, … }` field.
- Text: `TextDrawCommand` (`{ kind: 'text', text, pose, style }`).
- Nested transforms: wrap in `{ kind: 'group', transform, children: [...] }`.
- For per-vertex color paths (e.g. heatmaps), use `vertexColors?: number[]`
  on `PathDrawCommand` (requires a solid `paint.fill`).
- View transform applies at the renderer level via the layer system; layers
  emit world-space coords and let weasel's `drawLayers` handle transform.

## Test triage rule

For each `*.test.ts` colocated with a layer or tool you've ported, classify
by what it asserts on:

- **Behavior tests** (state changes, return values, hit-test outputs, snap
  computations, store interactions): **keep**, fix mechanical type errors,
  no semantic changes.
- **Pure rendering tests** (`expect(ctx.fillRect).toHaveBeenCalledWith(…)`,
  `expect(ctx.fillStyle).toBe(…)`): **delete**. The visual-regression rig
  covers rendering correctness; pixel-asserting unit tests are duplicative
  and brittle once we go through DrawCommand intermediates.
- **Mixed**: keep the behavior assertions, delete the rendering ones.

If a layer's test file is 100% rendering assertions, delete the file. List
deletions in the commit message.

## Patterns rewrite shape

```ts
// src/canvas/patterns.ts

import { createTilePattern, type Paint, type TextureHandle } from '@orochi235/weasel';
import { hatch, crosshatch, dots, chunks } from '@orochi235/weasel/patterns-builtin';

export type PatternId = 'hatch' | 'crosshatch' | 'dots' | 'chunks';

const cache = new Map<string, TextureHandle | null>();

export function getPattern<P extends PatternId>(
  id: P,
  params: Partial<PatternParamMap[P]> = {},
): TextureHandle | null { /* … */ }

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

Old `renderPatternOverlay(ctx, id, region, opts)` callers stop calling a
ctx-shaped helper; instead the layer that wanted the overlay emits a
`PathDrawCommand` for `region` with `paint: paintFor(id, params, opacity)`.

## Visual-regression rig

Modeled on weasel's. Local-only.

### Layout

```
tests/
  visual/
    fixtures/
      garden-empty.json
      garden-mixed.json            // zones + structures + plantings
      garden-mixed-selected.json
      garden-zoomed-in.json
      seed-empty.json
      seed-with-seedlings.json
      seed-sown-cells.json
    baselines/
      <fixture-name>.png
    visual.spec.ts
  visual.config.ts        // playwright config
```

### Mechanism

- Add Playwright as a devDep. New scripts:
  - `test:visual` — runs the spec against `npm run preview`.
  - `test:visual:update` — refreshes baselines.
- App reads `?fixture=<name>` early in `App.tsx`. If present, fetches
  `/tests/visual/fixtures/<name>.json`, calls `deserializeGarden`, and
  hydrates `useGardenStore` before first render. Behind a guard so it
  doesn't ship in production builds (vite `import.meta.env.DEV` or a
  `?fixture` short-circuit only in dev).
- Spec navigates to each fixture URL, waits for a known
  "first paint complete" signal (a `data-canvas-ready="true"` attribute
  set by the canvas component after first frame), takes a screenshot of
  the canvas element, compares to the baseline via `pixelmatch`.
- Threshold: per-pixel `0.1`, fail if `> 2%` of pixels differ. Same as
  weasel's pinned settings.
- Baselines are committed (PNGs in `tests/visual/baselines/`).
- Pinned to a single Chromium version via Playwright's bundled browser to
  avoid font/AA drift across local machines. Document the pinned
  Playwright version in the test README.

### Fixtures (initial set)

Garden surface (4):
1. `garden-empty` — blank garden at default zoom.
2. `garden-mixed` — 2 zones, 1 structure, 6 plantings spanning grid kinds.
3. `garden-mixed-selected` — same scene, one planting selected (exercises
   selection overlay layer).
4. `garden-zoomed-in` — same scene at 3× zoom (exercises view transform +
   font/atlas at higher density).

Seed-starting surface (3):
1. `seed-empty` — blank tray.
2. `seed-with-seedlings` — multiple seedlings placed.
3. `seed-sown-cells` — sown cells with seedling overlays.

Authoring: seed each fixture once by building the scene in the running
app, exporting the garden via the existing `downloadGarden` flow, copying
the resulting `.garden` JSON into `tests/visual/fixtures/`. Cheap to grow
later.

## Working-tree handling

The branch starts with the WIP files preserved verbatim. The plan
explicitly names them so they're not stomped:

- `src/canvas/adapters/plantingLayout.ts`
- `src/canvas/adapters/plantingMove.ts`
- `src/canvas/findSnapContainer.ts`
- `src/canvas/tools/useEricSelectTool.ts`

When the port reaches a file that's already partly done, prefer
extending the WIP over reverting it.

## Risks

- **Drag ghost replacement is the murkiest piece.** `createDragGhost` is
  fully gone with no obvious one-line successor. Plan reserves time for
  this; if `defineDragInsertTool` doesn't cover the palette-drop UX, fall
  back to a custom `RenderLayer`.
- **Pattern parity at small sizes.** Texture-based tile rendering may differ
  from old `CanvasPattern` at sub-pixel zooms. Visual regression catches
  this; if it fails, plan accommodates a tile-size tweak per pattern.
- **Test deletions reduce test coverage during the gap between port and
  baseline capture.** Mitigation: don't merge to `main` until baselines
  are captured and the visual run is green.

## Done definition

- `npx tsc -b` clean
- `npm test` green
- `npm run test:visual` green against committed baselines
- WIP files preserved (no manual reverts)
- Branch merged to `main`
