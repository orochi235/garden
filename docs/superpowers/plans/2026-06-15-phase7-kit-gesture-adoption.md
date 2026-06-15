# Phase 7 — Kit gesture + render adoption (delete eric's redundant pile)

> **For agentic workers:** one atomic transaction. No inter-stage scaffolds. ONE verification gate at the end.

**Goal:** Delete eric's parallel gesture/ghost/select/chrome infrastructure and render + gesture
the garden through weasel. Success is measured in **eric LOC deleted / weasel surface adopted**, not
minimal diff.

**Objective function:** adopt as much weasel as weasel actually supports; keep only irreducible eric
domain logic. Weasel is ours — if a clean adoption needs a small kit surface, add it (same transaction).

---

## Adopt (weasel does it)

- **Node rendering** — provide `layers.scene` `SceneSlotConfig.drawOne(node, pose, view) => DrawCommand[]`
  dispatching by `node.kind` to eric's existing per-entity draw bodies (extracted from
  `{zone,structure,planting}LayersWorld.ts`). Turn the scene slot **on** (drop `scene: null`).
- **Drag ghosts** — `usePreviewGhostLayer` (built into `<SceneCanvas>`) renders ghosts via the same
  `drawOne`. Requires the scene slot on. Reflowed siblings during a planting-into-container drag =
  weasel TODO.md:185 (`hypotheticalChildPositions`) — **ask weasel to wire option 2 now** (it's
  relevant only under kit-ghost adoption).
- **Selection chrome + resize handles** — kit built-in overlay (`MultiSelectDemo` confirms it draws
  the selection box + corner handles with no consumer chrome).
- **Marquee** — kit dispatcher overlay (`useDispatcherOverlayLayer`) + `selectFromMarquee()`.
- **Gestures** — `enableGestureDispatcher={true}`; kit `selectTool` owns move/resize/area-select/clone
  through the dispatcher. `move.behaviors` carries eric's domain behaviors; `move.expandIds` carries
  group expansion; `cascadeWorldPose` carries container cascade.
- **Adapter defaults** — use `useSceneAdapter` / kit `geometry` defaults wherever the rect-pose scan is
  correct (structures/zones). Override only where eric's domain differs (planting footprint bounds/hit).

## Keep (irreducible eric domain — NOT redundant)

- `adapters/gardenScene.ts` callbacks: `getLayout`→`plantingLayoutFor` (kit `LayoutStrategy`),
  `findSnapTarget`→`findSnapContainer` (→ kit `SnapTarget`), planting `getBounds`/`hitAll`/`getPose`/
  `setPose` (world↔local). Slim to the callback bag the kit knobs + cycle tool consume.
- Domain move behaviors (passed as `move.behaviors`): `snapStructureZoneToGrid`,
  `clampStructureZoneToGardenBounds`, `detectStructureClash`, `trackPlantingSnap`, `requirePlantingDrop`
  — repoint their kit imports from `../gestures` to `@orochi235/weasel`/`/move`.
- `utils/groups.ts#expandToGroups` → `move.expandIds`/`resize.expandIds` (flat `groupId` siblings; NOT
  scene `getChildren` containment — no kit helper fits).
- `useEricCycleTool` (alt-click cycle through overlap + alt-drag clone) — no kit analog.
- Per-entity **draw bodies** (now invoked via `drawOne`, not as RenderLayer scaffolding).
- Cross-node layers with no kit analog: planting **labels + de-occlusion**, **conflict/occupancy
  overlay** (red/yellow footprint), **group-outline** (eric `groupId`, not kit selection bbox),
  system origin marker, grid (`GridSlotConfig`, already kit), debug layers.
- Pan / wheel-zoom / click-zoom / insert / palette-drop tools (eric-custom).

## Delete (redundant — replaced by weasel)

- `src/canvas/gestures/*` (~2558 LOC): `move, resize, areaSelect, clone, dragGesture, dragRect,
  geometry, composePose`; reduce `index/types/behaviors` to nothing eric imports.
- `src/canvas/drag/{moveDrag,resizeDrag}.ts` (garden-only ghost façade) + their `dragPreview` mirror.
  `areaSelectDrag.ts`/`dragPreviewLayer.ts` are **shared with nursery** — leave for nursery; remove only
  the garden registration. (Nursery's own kit adoption is out of scope here.)
- `src/canvas/tools/useEricSelectTool.ts` (the ~830-line hub) + its test. Surviving custom click
  semantics — **group-outline-edge click-to-promote** and **`select-area` force-marquee** — collapse into
  a small focused tool (or kit `pickBest`) if the kit doesn't expose them; otherwise delete outright.
- `selectionLayersWorld.ts`: per-node **selection outline + handles** → kit chrome. Keep **group-outline**
  (eric domain) and the `?debug=handles` layer.

## Execution

1. Worktree (isolation) — large 2-repo churn.
2. Scene-slot keystone: extract per-entity `drawOne`; turn the slot on; delete eric ghost path.
3. Dispatcher + `selectTool` config (behaviors / expandIds / cascade / geometry / areaSelect); drop the
   `useEricSelectTool` registrations.
4. Repoint kit imports off `../gestures`; delete the redundant files; let `tsc`/tests drive the sweep.
5. Re-home the two surviving click semantics; delete the hub.
6. **Verification gate (only one):** behavior-level tests as the parity oracle
   (`snapMoveBehaviors`, `structureMoveBehaviors`, `useEricCycleTool`, `plantingLayout`), then full
   `npx vitest run`, `npx tsc -b`, `npx biome check .`, `npm run test:visual` (4/4). Report final
   eric LOC deleted.
