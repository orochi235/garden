# Project TODO

Backlog of work that's been considered but not scheduled. Add new items at the bottom of the relevant section.

## canvas-kit / weasel

Backlog for the kit lives at [`docs/canvas-kit/TODO.md`](canvas-kit/TODO.md) so it travels with the kit when it splits out into the `@orochi235/weasel` repo. Add kit-specific items there, not here.

## Text rendering (MSDF unification)

Canvas text now renders (weasel `tsup splitting:true` shared the font registry; eric
registers the Inter atlas at boot in `main.tsx`). Follow-ups:

- **Deferred (weasel-side workstream):** unify on a single MSDF text renderer and retire
  the 2-D `renderLabel`/`createMarkdownRenderer` path. eric's stake is the cultivar packet
  tiles (`src/components/collection/CultivarIconView.tsx` → `PacketCanvas`), which render
  to a DOM 2-D `<canvas>` using outline/shadow/letter-spacing/markdown effects MSDF
  doesn't have yet. Full plan + acceptance in weasel's `HANDOFF-msdf-text-unification.md`.
  When MSDF gains outline/shadow/letter-spacing + offscreen raster, migrate the tiles.

## Canvas redesign deferrals (Phase 2)

- `vite.config.ts` keeps `resolve.dedupe: ['react', 'react-dom']`. It was load-bearing while weasel was consumed as a `file:../weasel` link (the linked package's own `node_modules` produced duplicate-React errors). As of 2026-07-31 eric depends on published `@weasel-js/core@^0.7.0`, where React is a peer dep and hoists normally — the dedupe is retained as cheap insurance, not because it is required. Safe to drop if it ever gets in the way.

## Canvas redesign deferrals (Phase 4)

- Gutter handling (drag-spread affordances along tray edges) deliberately omitted from `SeedNode`. A parallel sub-task owns the design decision; once resolved, add a `GutterNode` kind and re-introduce `hitTestDragSpreadAffordance` integration.
- Gutter overlay reads scratch via a `useRef` mirror because the `RenderLayer` is created once per tool. If weasel ever supports per-render scratch access in `Tool.overlay.draw`, simplify by removing the ref.

## Editing

- Multi-select group-drag clamp/clash edge cases: weasel's `useMove` invokes `MoveBehavior.onMove` only on the primary id; secondaries share the primary's delta. Today the clamp computes the union AABB and shifts the primary, which transitively shifts secondaries (correct). The clash detector likewise uses the secondaries' AABBs (each derived from origin + primary delta). Two follow-ups:
  - (2) `behavior.onMoveAll` hook in weasel — open. Cross-package design work; not implementable from eric alone. Tracked under `docs/canvas-kit/TODO.md` Tier 1.5 ("`MoveBehavior.onMoveAll(ctx)` hook"). The current shared-delta workaround is documented inline in `useEricSelectTool.ts` above `moveBehaviors`.

## Phase 5 audit punch list — remaining

Surfaced during the post-migration audit (commits `0ec1cdc`…`02140b0` closed the rest). Roughly ordered by user-visible impact.

- **Freehand/polygon draw tool for `viewMode === 'draw'` without a plotting tool selected.** Currently aliases to select. Design a draw tool that emits a free-form zone or annotation.

## Almanac

- **PHZM disclaimer for any rendered map.** Per the OSU/USDA terms-of-use bundled with the PHZM 2023 raster, derived maps must either keep both USDA-ARS and OSU logos or carry a "not the official USDA Plant Hardiness Zone Map" disclaimer with logos removed. Today we only consume the data as point lookups (no map rendering), so no disclaimer surface exists. If we ever render a heatmap, choropleth, or zone-by-region overlay derived from this grid, add the disclaimer/logo surface at that point.

## Seed-starting multi-tray auto-flow deferrals (v1, 2026-05-04)

- **Bench / shelf parents.** _Priority: medium-low — not needed yet._ Trays should be groupable into a "bench" or "shelf" parent that owns its own world pose, with trays auto-flowing within the parent. Touches the seed-starting model schema, `seedStartingScene` adapter, and persistence. Design questions to settle before starting: (1) is a bench a logical grouping or a visible container with its own footprint? (2) can a tray be parentless or must every tray belong to a bench? (3) how does the user create one (toolbar / palette / automatic)? (4) does FloatingTraySwitcher group entries by bench or stay flat?

## Raised-bed feature

- [ ] Build a real `bands` editor for `banded-rows` arrangements (currently JSON-only).
- [ ] Build a region-painting UI for `multi` arrangements (currently optimizer-only entrypoint).
- [ ] Auto-migration of existing `rows`-arrangement raised beds to `multi` when companion blocks are detected.

## Bed-layout optimizer deferrals (Plan 2, 2026-05-04)

- [ ] **Populate cultivar metadata for optimizer fields.** The MILP needs per-cultivar sun requirements, companion/antagonist relationships, and other agronomic data; current `cultivars.ts` only has display + footprint info. Without this, the optimizer's pairwise terms (shading/companions/antagonists) reduce to noise. Plan: extend `Cultivar` with `sun: 'full'|'partial'|'shade'`, `season`, etc.; backfill the existing entries; expand `companions.ts` from the v1 ~30-pair seed to a sourced table.
- [ ] Extract `src/optimizer/` into a standalone npm package once the API has settled.
- [ ] Symmetry/aesthetic objective term for the optimizer (deferred — hard to linearize).
- [ ] Live re-optimization during drag (deferred — UX complexity).
- [ ] Multi-season / crop rotation optimization.
- [ ] Optimizer support for non-rectangular beds.
- [ ] User-facing solver picker (currently fixed to `highs`).
- [ ] Region-painting UI for `userRegions` input to the optimizer.

## Optimizer auto-clustering follow-ups (2026-05-05)

- [ ] Interior trellis support (`trellis: { kind: 'line', ... }`): UI for placement, allocator for dual-side strip layout. Currently rejected with an error in `proportionalStripAllocator`.
- [ ] **Bin-packing allocator** for the optimizer adaptive dispatcher. When clusters have wildly different aspect-ratio preferences (e.g. one cluster wants a tall narrow strip, another wants a square block), guillotine still produces axis-aligned recursive cuts that may not fit either preference well. A bin-packing allocator (e.g. shelf-pack or skyline) could pack arbitrary-aspect cluster bounding boxes more flexibly. Slot into `adaptiveAllocator` in `src/optimizer/allocation/adaptive.ts` with a new threshold criterion.
- [ ] Sub-bed-level parallelism inside `solveClustered` (true per-cluster fan-out across the worker pool, beyond today's per-candidate fan-out)

## UI consistency & usability review (2026-10-29)

Found by driving the dev server headless plus a source audit; the clear-cut fixes landed 2026-10-30. What's left needs a design call or is a larger piece of work.

### Needs a decision

- [ ] **Should a plotting tool stay armed after drawing one bed or zone?** Today it stays armed until Escape or another tool is picked. The old one-shot disarm was dead code, so this has never been decided.
- [ ] **Capitalization style.** Labels mix Title Case ("Render Layers", "In Collection", "Select Area", "Your Trays", "Edit Collection…") and sentence case ("Fit view", "Plant list", "New from preset", "Tray schedule"). Pick one.
- [ ] **What to call the plants.** The UI says seedables, cultivars, plants, plantings, and varieties in different places ("Search seedables…" in the nursery, "Cultivar ID" in the plant list).
- [ ] **One segmented-control style.** The collection view toggle (green), Schedule's Flat / By date / By plant (light gray), and its List / Calendar tabs (underlined) each look different. A shared component needs a chosen look.
- [ ] **Debug controls in the user sidebar.** The Debug section and the menu's "dev" dropdown show in every build. Both resets now ask first (2026-10-30); whether to hide them outside `import.meta.env.DEV` is open.
- [ ] **The Schedule's default target date is two months out** (`defaultTargetDate` in `scheduleViewModel.ts`), which lands in late December this time of year. A frost-date-based default would need the Almanac's last-frost setting.
- [ ] **Dates are formatted two ways:** `2026-12-29` in the plant list, "Dec 29" in the Schedule.

### Larger work

- [ ] **Adding to the collection takes three steps:** select a packet, click "Add (1) ›", then Save. Packets now say "double-click to add" and are keyboard-reachable (2026-10-30), but the flow itself is unchanged.
- [ ] **No spacing, font-size, or shadow tokens.** Colors and radii now go through `global.css`; sizes are still literals.
