# Codebase Audit Findings

## Status: Safe autonomous items complete. Items 7-9 need interactive review.

---

## Quick Wins (Duplication / Dead Code)

### ~~1. PX_PER_FT duplicated 3x in drag-lab~~ DONE
- `drag-lab/CanvasRenderer.tsx:4`
- `drag-lab/ItemPalette.tsx:5`
- `drag-lab/strategies/quadtree.ts:362`
- **Fix:** Create `drag-lab/constants.ts`, export from there

### ~~2. LAYER_CONFIG_KEY duplicated between quadtree.ts and Workspace.tsx~~ DONE
- `strategies/quadtree.ts:401` (not exported)
- `Workspace.tsx:17` (copy-pasted)
- **Fix:** Export from quadtree.ts

### ~~3. getLayerOrder duplicated between quadtree.ts and Workspace.tsx~~ DONE
- `strategies/quadtree.ts:424` (not exported)
- `Workspace.tsx:28` (copy-pasted)
- **Fix:** Export from quadtree.ts

### ~~4. Unused type: `genericRadius` in WorkspaceState~~ DONE
- `drag-lab/types.ts:67` — defined but never read
- **Fix:** Remove or document intent

### ~~5. Unused CSS classes in LayerPropertiesPanel.module.css~~ FALSE POSITIVE
- Investigated — `.groundColor` and `.value` don't exist in the CSS module. Grep matched JS `.value` expressions.

---

## Structural Improvements

### ~~6. quadtree.ts is 724 lines — extract layer rendering~~ DONE
- Extracted layer definitions, hatch/crosshatch, and all 8 layer renderers to `quadtreeRenderer.ts` (323 lines)
- quadtree.ts reduced from 724 to 409 lines (tree ops + strategy interface)
- Re-exports all public symbols so existing imports work unchanged

### 7. CanvasStack.tsx (638 lines) — excessive coupling
- 35 separate `useUiStore()` calls for individual state pieces
- Duplicate hit-test sequences at lines 463-465 and 517-519
- `handleMouseDown` is 157 lines
- **Fix:** Batch selectors, extract `performHitTest()`, extract drag hooks

### 8. useMoveInteraction.ts (512 lines) — mixed concerns
- Snapping logic (~140 lines, 281-356) is self-contained
- Coordinate transform logic repeated (lines 95, 148-149, 273-278)
- **Fix:** Extract `useSnapDetection()` hook and `toWorldCoords()` helper

### 9. uiStore.ts — setter bloat
- 24 individual setter actions for debug flags
- ~~Initial state and reset() repeat 12+ fields~~ DONE — extracted `defaultState()`
- Setter consolidation (`setDebugOption(key, value)`) deferred — touches tests + LayerPropertiesPanel, needs review

### ~~10. LayerPropertiesPanel.tsx (472 lines)~~ DONE
- Extracted `DebugThemePanel.tsx` (181 lines) and `LayerSection.tsx` (44 lines)
- LayerPropertiesPanel reduced from 472 → 256 lines

---

## Research: Force-Directed Relaxation & Constraint-Based Layout

### Goal
Explore whether force-directed relaxation or constraint-based solving could improve
layout strategies in drag-lab (or the main garden planner).

### Questions to Answer
- What JS libraries exist for force-directed graphs / physics simulation?
- How would constraints be expressed (min spacing, container bounds, alignment)?
- Could this replace or augment the quadtree strategy?
- What's the interaction model — continuous relaxation during drag, or settle-on-drop?
- Performance considerations for real-time simulation

### Library Options

| Library | Size (gzip) | Fit |
|---------|------------|-----|
| **d3-force** | ~28KB | Best. Lightweight, decoupled, designed for layout. |
| matter.js | ~110KB | Overkill — full rigid-body physics. |
| planck.js | ~50KB | Box2D port, unnecessary complexity. |
| rapier | ~500KB WASM | Way too heavy. |

**Recommendation:** d3-force. No physics deps currently in package.json.

### Force Model for Garden Layout

Treat each plant as a particle with three forces:
- **Repulsion**: Many-body force between overlapping circles
- **Container boundary**: Push plants away from walls
- **Grid attraction** (optional): Weak spring to nearest grid point

Convergence: 20–50 steps/frame, α decay 0.96–0.99. Settles in ~100–200ms for 50 items.

### Force-Directed vs Constraint-Based

Force-directed is better here — organic spacing, not rigid snapping. Constraint-based
(hard geometric solving) is more complex and feels less natural for garden layout.

### Interaction Model

**Recommended: settle-on-drop.** Physics runs after release, 200–300ms animation.
Optional: continuous mode for <30 items, manual "Relax" button for power users.

### Integration

Two options:
- New async `onDropSettle?()` method on LayoutStrategy
- Simpler: run physics in Workspace store, strategies stay stateless

Config: repulsion strength, boundary force, min spacing, grid snap strength, max iterations.

### Performance

50 items: ~5–10ms (easy). 100 items: ~15–25ms with quadtree acceleration (viable).
200+: needs Web Worker. Reusing existing quadtree for collision = O(n log n).

### Status: Research complete, ready for design/implementation
