# Container Layout Rewrite

**Date:** 2026-05-07  
**Status:** Approved

## Summary

Throw out the existing arrangement/optimizer system entirely and replace it with three simple, working layout modes: single, grid, and snap-points.

## What's Being Deleted

- `src/model/arrangement.ts` and all of `src/model/arrangementStrategies/`
- `src/optimizer/` (entire directory)
- `src/model/cultivarSpacing.ts`
- `src/components/sidebar/OptimizePanel.tsx`
- `src/components/optimizer/` (OptimizerWizard, runOptimizerForBed)
- Arrangement-mode dropdown and all mode-specific param forms in `PropertiesPanel.tsx`
- `applyOptimizerResult()` from `gardenStore.ts`
- `docs/superpowers/specs/2026-05-04-raised-bed-layout-strategies-design.md`
- `docs/superpowers/specs/2026-05-05-optimizer-auto-clustering-design.md`

## New Data Model

```ts
type Layout =
  | { type: 'single' }
  | { type: 'grid'; cellSizeFt: number }
  | { type: 'snap-points'; points: { x: number; y: number }[] }
```

`Structure` and `Zone` replace their `arrangement` field with `layout?: Layout | null`. Old `arrangement` data is dropped with no migration.

## Slot Computation

```ts
getSlots(layout: Layout, bounds: ParentBounds): { x: number; y: number }[]
```

Handles **single** and **snap-points** only:

- **single** — returns one point at container center
- **snap-points** — returns the stored list verbatim

Grid mode does **not** go through `getSlots`.

## Canvas Integration

The canvas adapter (`plantingLayout.ts`) branches on layout type:

- **grid** — configures a weasel grid layer on the container; snapping is weasel's responsibility, no custom slot list or overlay
- **single / snap-points** — calls `getSlots`, maps results to weasel drop targets as before

The container overlay (`containerOverlay.ts`) is simplified to draw dots at `getSlots` positions. Grid mode gets no custom overlay (weasel handles it).

## UI

`PropertiesPanel.tsx` gets a simple layout type picker (single / grid / snap-points) and a cell size input that appears only for grid mode. All other arrangement UI is removed.

## Non-Goals

- No cultivar-aware spacing
- No subdivision generalization
- No snap-point editing UI (points are pre-specified; editing comes later)
- No backward compatibility with existing `arrangement` data
