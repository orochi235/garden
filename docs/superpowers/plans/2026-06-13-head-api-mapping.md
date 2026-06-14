# weasel HEAD → eric migration mapping (authoritative spec)

> Derived from the 5-surface HEAD API survey (2026-06-13). This is the **canonical reference**
> every edit agent works from during the SP2–SP4 coupled cutover. If you find the survey wrong,
> verify against `~/src/weasel/dist/index.d.ts` and fix this doc, don't diverge silently.

## Architecture decision (LOCKED — do not re-open during the cutover)

**Minimal-to-green.** eric's garden/nursery state stays in the **Zustand `gardenStore`** with the
**snapshot-history stack** (`gardenHistory`/`nurseryHistory`, `createHistoryStack`). eric's adapters
remain **hand-crafted facades over the store** — they are NOT scene-backed.

- **DO NOT** adopt `sceneToAdapter` / `useSceneAdapter` for the cutover. That requires garden state to
  live inside `Scene`, which SP1 deliberately did not do. It's a future refactor (post-green).
- **DO NOT** wire `scene.undo/redo/batch/recordOp/registerOp` or `scene.applyBatch`. The snapshot
  stack stays the source of truth. `scene` remains the derived structure SP1 made it.
- **DO** keep `GardenScene`/`createGardenScene`/`GardenPose`/`gartenToScene`/`sceneToGarden` exactly as
  they are — the survey confirms they are **already HEAD-correct**.

What *must* change is purely the **kit interface surface**: adapter method names/shapes, the removed
gesture hooks, and render-type imports. That's the whole cutover.

---

## Surface 1 — Adapters (H1) — MECHANICAL

Per-file, independent, parallelizable. Pattern for every adapter:

1. **Stop `extends`-ing kit adapters.** Implement the HEAD interface directly (structural typing).
2. **Rename `applyBatch(ops, label)` → `applyOps(ops, label)`.** Signature identical; method is now
   `optional` on the kit interfaces (`MoveAdapter`/`ResizeAdapter`/`InsertAdapter`/`AreaSelectAdapter`).
3. Keep the body as-is (still calls `useGardenStore.getState().checkpoint()` etc.).

| File | Change |
|---|---|
| `adapters/structureMove.ts` | drop `extends MoveAdapter`; `applyBatch`→`applyOps` |
| `adapters/zoneMove.ts` | same |
| `adapters/plantingMove.ts` | same; **keep** the coalesceKey sort (reparent-before-transform) — still needed |
| `adapters/structureResize.ts` | drop `extends ResizeAdapter`; `applyBatch`→`applyOps` (label required, `_label` ok) |
| `adapters/zoneResize.ts` | same (identical to structureResize) |
| `adapters/insert.ts` | implement `InsertAdapter<GardenObj>` directly; `applyBatch`→`applyOps` |
| `adapters/gardenScene.ts` | **merge** the two methods: old `applyBatch` (labeled, checkpointed) + `applyOps` (transient area-select, no label) → one `applyOps(ops, label?)`. Checkpoint **iff `label` present**. Make interface field optional. |
| `adapters/nurseryScene.ts` | same `applyBatch`→`applyOps` treatment (H3, but do it in H1's sweep) |
| `adapters/plantingLayout.ts` | **NO CHANGE** — already a compliant `LayoutStrategy<PlantingPose>`. Verify `DropTarget` shape `{ pose, origin, hitBounds?, meta? }`. |

HEAD adapter interfaces (from `dist`, originally `types-Dh02rT4N`):
- `MoveAdapter<TNode,TPose>`: `getNode/getNodes/getPose/getParent?/setPose/setParent?/applyOps?/findSnapTarget?/getChildren?/getLayout?`
- `ResizeAdapter<TNode,TPose>` & `RotateAdapter`: `getNode/getPose/setPose/applyOps?` (rotate identical to resize)
- `AreaSelectAdapter`: `hitTestArea?/getSelection?/setSelection?/applyOps?` (label OPTIONAL here)
- `InsertAdapter<TNode>`: `commitInsert?/commitPaste?/snapshotSelection?/getPasteOffset?/insertNode/setSelection/applyOps?/getSelection`

**Why the ~190 cascade clears:** eric's Scene types are already correct; the TS2363/TS2722/TS18048/
TS7006 errors flow from adapters losing their generics when `extends` breaks. Re-fitting the adapters
restores the generic flow downstream.

---

## Surface 2 — Render / layers (H1) — MECHANICAL

These symbols are now **public in `@orochi235/weasel`** (they were private in the pin, hence the
`weaselLocal.ts` shims). **Delete the shims, import from the kit.**

| `weaselLocal.ts` shim | HEAD public replacement |
|---|---|
| `DrawCommand` (derived from `RenderLayer['draw']`) | `DrawCommand` exported (`PathDrawCommand \| GroupDrawCommand \| TextDrawCommand \| ImageDrawCommand \| ShaderDrawCommand`) |
| `TextureHandle` (derived from `createTilePattern`) | `TextureHandle` exported (`{ readonly id: string }`) |
| `viewToMat3` (local reimpl) | `viewToMat3(view: View): Mat3` exported |

- **Keep** in `weaselLocal.ts`: the polygon helpers (`circlePolygon`/`ellipsePolygon`/`roundRectPolygon`)
  and the `PolygonPath` re-export. Delete only `DrawCommand`/`TextureHandle`/`viewToMat3`.
- Update every layer file (`selectionLayersWorld`, `zoneLayersWorld`, `plantingLayersWorld`,
  `trayLayersWorld`, `structureLayersWorld`, `seedlingLayersWorld`, `systemLayersWorld`, `debugLayers`)
  to import `DrawCommand`/`TextureHandle`/`viewToMat3` from `@orochi235/weasel` (or the trimmed `weaselLocal`).
- **`Paint` → `FillStyle`.** Solid usage `{ fill: 'solid', color: '#…' }` is unchanged at runtime;
  only the type name changes. `FillStyle` solid form: `{ fill?: 'solid'; color: string; opacity? }`.
- `RenderLayer<TData>` unchanged. `drawLayers` is public and auto-wraps world-space layers with
  `viewToMat3` — eric may keep manual composition for now (no change required).
- `registerNodeShape` / `CustomPaintContext` exist but eric uses neither today — ignore for the cutover.

---

## Surface 3 — Scene / pose / history — MOSTLY NO-CHANGE

- `GardenScene = Scene<GardenNodeData, GardenLayer, GardenPose>` — **correct, no change.**
- `createGardenScene` / `createScene<…>({systemLayers, initial, historyLimit})` — **correct.**
- `GardenPose = {x,y,width,height,rotation?,shape?}` — valid `TPose`; HEAD preserves opaque extra keys.
- **GOTCHA (only real Scene break):** `historyEntries()` and `historyIndex()` are **METHODS, not
  properties** on HEAD. If any eric code reads `scene.historyIndex`/`scene.historyEntries` as a
  property, call it. (Most eric code doesn't touch these — snapshot stack instead.)
- Do **not** wire `scene.setActiveJournalAccessor` (journal/`weasel-history` is unused under SP1).
- Custom op kinds must NOT start with `kit:` (reserved) — only relevant if we ever call `registerOp`,
  which the cutover does not.

---

## Surface 4 — Garden gestures (H2) — REAL REWIRE

The 6 hard breaks. `useMove`/`useResize`/`useAreaSelect`/`useClone` + `cloneByAltDrag` are **removed**.

| Pin hook (eric uses) | HEAD replacement |
|---|---|
| `useMove(adapter,{behaviors})` | `moveAction` + `useGestureDispatcher` binding + `useSelectTool` binding (`kind:'drag', target:'selected-body'`) |
| `useResize(adapter,{behaviors})` | `resizeAction` + `useResizePolicy` dep + `useSelectTool` binding (`affordance:'handle:*'`) |
| `useAreaSelect(adapter,{behaviors:[selectFromMarquee()]})` | `areaSelectAction` + binding (`target:'empty'`). `selectFromMarquee` GONE — action calls `deps.areaSelect.setSelection()` itself |
| `useClone(adapter,{behaviors:[cloneByAltDrag()],setOverlay,clearOverlay})` | `cloneAction` + dispatcher binding **modifier gate** for alt. Overlay callbacks GONE → `previewIds()/previewPose()` + `previewHidesSource:false` |

Stack to stand up (in eric's garden canvas): `DepRegistryProvider` (deps: `selection` bridged to
`uiStore.selectedIds`, `view`, `scene`, `pointer`, `resizePolicy`, `areaSelect`, `insert`, `activeTool`),
`useStandardActions`, `useActionsRegistry`, `useGestureDispatcher`, `useSelectTool`. Likely keep eric's
own `Canvas` and wire the 5 kit contexts manually (decide in H2 from `CanvasNewPrototype.tsx`).

**Behavior signature change** (`MoveBehavior.onMove`):
- OLD: `onMove(ctx, proposedPose) → { pose? }`
- NEW: `onMove(GestureContext, proposed: GroupTransform) → { transform?: GroupTransform, snap?, pose?(deprecated) }`
- `GestureContext` has `draggedIds`, `origin: Map`, `current: Map`, `modifiers`, `pointer`, `adapter`, `scratch`.
- `proposed` is `{ kind:'translate', dx, dy }`, NOT a pose. Behaviors run on **primary id only**;
  secondaries inherit the same delta.
- Eric's bespoke behaviors port directly:
  - `clampStructureZoneToGardenBounds` / `detectStructureClash` (union-AABB over all dragged ids):
    read `ctx.origin.get(id) + delta` for each dragged id; return adjusted `{ transform }`.
  - `snapStructureZoneToGrid` (wraps weasel snapToGrid): internal already returns `{ transform }`.
  - `requirePlantingDrop` (wraps `snapBackOrDelete`): `onEnd` returns `Op[]` (commit) / `null` (abort) / `void`.

**resizePolicy renames:** `behaviors`→`constraints` (`BoundsConstraint[]`), `geometry`→`projection`
(`PoseProjection<TPose>`); `pointSnap` kept (different sig); `expandIds` for union-AABB group path.
Source via `useResizePolicy()` / `useDepSource('resizePolicy', …)`. Structure-vs-zone resize: feed both
adapters' deps into one `resizePolicy` (or two bindings discriminated by affordance), not two `useResize`.

**Preview:** move/resize/rotate hide source + show ghost via `previewIds()/previewPose()` (dispatcher's
`usePreviewGhostLayer`). Marquee via `OngoingHandle.overlay() → {kind:'marquee',start,current,shiftHeld}`
(dispatcher's `useDispatcherOverlayLayer`). No `effect()` mirror needed — actions own preview state.

---

## Surface 5 — Nursery / clipboard / preview (H3 + H4) — minimal first

- `useClipboard` → `useClipboardOps(adapter, {getSelection, onPaste?, pasteLabel?, getDropPoint?})`.
- Nursery tools (`useFillTrayTool`, `useSeedlingMoveTool`, `useSeedSelectTool`, `useGardenPaletteDropTool`):
  keep as Tool descriptors for the minimal cutover; port the bespoke dual move/fill ghosts onto
  `overlay() {kind:'commands'}` (world space). Keep `nurseryHistory` snapshot stack.
- H4 deletion candidates once the kit owns the gestures: `canvas/drag/{areaSelectDrag,seedFillTrayDrag,
  seedlingMoveDrag,dragGhost}.ts`; re-evaluate `dragPreviewLayer`/`putativeDrag`/`useDragController`.
- Riskiest visual-parity area: two ghost pipelines (`dragPreviewLayer` putative vs dispatcher overlay)
  coexisting during the transition — consolidate in H4, verify via `test:visual`.

---

## Open questions resolved (were flagged by survey agents lacking plan context)

- *Adopt `sceneToAdapter` / scene history?* — **No** (locked above; minimal-to-green).
- *Merge `applyBatch`+`applyOps` — how to keep checkpoint vs transient?* — key off **label presence**.
- *clone alt-gate?* — **binding-level** modifier gate (HEAD Phase 12 is dispatcher-level; until then a
  manual gate in the binding or decline in `start()` by returning an empty handle).
- *SceneCanvas vs eric's own Canvas?* — decide in H2 from `CanvasNewPrototype.tsx`; default to keeping
  eric's Canvas + manual context wiring (less disruptive to the bespoke world-space layer painters).
