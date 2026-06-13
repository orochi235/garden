# SP1 — Scene as the Garden Data Core

**Parent:** `2026-06-13-weasel-action-api-migration-roadmap.md` (sub-project 1 of 5).
**Develops against:** the pinned weasel (`~/src/weasel-eric-pin`, `323d0914`) — the Scene data API
there is ~identical to HEAD (51-line `Scene` type delta), and the old canvases keep compiling so the
app runs throughout. The HEAD cutover happens in SP2.
**Goal:** Make a weasel `Scene` the source of truth for the **garden** domain state (structures,
zones, plantings) and its undo/redo, with **zero visible behavior change**. The existing garden
canvas (`Canvas` + `gardenScene` adapter + `dragPreview`) keeps rendering, now reading from the
Scene. Nursery state stays in the `.garden`/store as-is (it gets its own scene in SP3).

## Ship gate (must all hold)

- Full vitest suite green (currently 758 tests).
- Visual-regression suite green (no pixel change).
- `npm run check:optimizer-boundary` clean.
- A `.garden` file round-trips: load → (no edits) → save produces an equivalent garden (modulo the
  intended load-time migrations).
- Undo/redo parity: the same user edits produce the same undo granularity and selection restoration
  as today.
- App runs; manual smoke of add/move/resize/delete + undo + save/load.

## The Scene type parameters

`GardenScene = Scene<GardenNodeData, GardenLayer, GardenPose>`

```ts
type GardenLayer = 'ground' | 'blueprint' | 'structures' | 'zones' | 'plantings';

// Rect pose for all node kinds. We adopt RectPose's field names ({x,y,width,height})
// internally so kit move/resize/render helpers work unmodified, and translate
// eric's `length` <-> `height` at the .garden boundary (see "Pose decisions").
// `shape`/`rotation` ride along; kit treats unknown pose fields as opaque.
interface GardenPose { x: number; y: number; width: number; height: number; rotation?: number; shape?: 'rectangle' | 'circle'; }

// Domain payload minus geometry. One discriminated union by `kind`.
type GardenNodeData =
  | { kind: 'structure'; type: string; color: string; label: string; zIndex: number;
      groupId: string | null; snapToGrid: boolean; surface: boolean; container: boolean;
      fill: FillType | null; layout: Layout | null; wallThicknessFt: number; clipChildren: boolean }
  | { kind: 'zone'; color: string; label: string; zIndex: number; soilType: string | null;
      sunExposure: string | null; layout: Layout | null; pattern: string | null }
  | { kind: 'planting'; cultivarId: string; label: string; icon: string | null };
```

(`GardenNodeData.kind` is eric's own discriminator stored in `data`; it is distinct from the
Scene node's structural `kind: 'leaf' | 'container'`.)

## Node mapping

| eric entity | Scene node `kind` | `layer` | `parent` | `pose` | notes |
|---|---|---|---|---|---|
| `Structure` (container:true — raised-bed/pot/felt-planter) | `container` | `structures` | its `parentId` or null | `{x,y,width,height:length,rotation,shape}` | holds plantings |
| `Structure` (container:false — fence/trellis/path/patio) | `leaf` | `structures` | null | same | no children |
| `Zone` | `container` | `zones` | its `parentId` or null | `{x,y,width,height:length}` | holds plantings |
| `Planting` | `leaf` | `plantings` | **required** (its `parentId`) | `{x,y,width:fp,height:fp}` | x,y parent-local |

- **Containment.** `Planting.parentId` (always set) → the Scene `parent` of the planting leaf.
  Structures/zones are roots (`parent: null`) unless they themselves nest (`Structure.parentId`).
- **Parent-local poses confirmed.** `planting.x/y` are already parent-local (verified:
  `plantingWorldPose` composes world by adding the parent offset; `worldToLocalForParent` inverts).
  This matches weasel Scene's documented "pose is local to the direct parent" semantics, so planting
  coords map straight through with no frame conversion. Structures/zones (roots) carry world coords,
  which is also correct for root nodes.
- **`zIndex` → render order.** eric's explicit `zIndex` maps to Scene child/root ordering. The
  converter sorts siblings by `zIndex` when building the Scene; `renderOrder()` then reflects it.
  Keep `zIndex` in `data` as the canonical value (the optimizer/UI read it); treat Scene order as
  derived. (If a future edit reorders via the Scene, sync `zIndex` back — out of SP1 scope; SP1 is
  read-equivalent.)
- **`groupId`** stays in `data` untouched in SP1 (group-drag is an SP2 gesture concern).

## Pose decisions

1. **Point-plantings → square pose.** A `Planting` has only `{x,y}`; its footprint comes from the
   cultivar. The Scene needs a pose per node, and kit move/hit-test/preview want a rect. Store
   plantings as `{x, y, width: fp, height: fp}` where `fp = cultivar.footprintFt` (derived at
   convert time, recomputed on cultivar change). The painter still draws the icon from the cultivar;
   the rect pose exists for hit-testing/move/preview. The `.garden` write drops width/height back to
   just `{x,y}` (footprint is never persisted — it's derived today too).
2. **`length` vs `height`.** eric's depth dimension is `length`; RectPose calls it `height`. Adopt
   `height` *inside* the Scene so every kit helper (resize geometry, `composeWorldPose`,
   `translatePoseGeneric`, default drawOne) works unmodified, and translate `length` ⇄ `height` in
   the `.garden` ⇄ Scene converters only. Rejected: a custom `length` pose + projection — it would
   force a projection on every kit pose op for no benefit.
3. **`shape`/`rotation`** ride along in the pose as extra fields; the kit ignores unknown pose keys
   and eric's painter/hit-test read them.

## `.garden` ⇄ Scene converters (the boundary)

Two pure functions, the only place the two shapes meet:

- `gardenToScene(garden): { nodes: AddNodeSpec[]; systemLayers }` — build the initial Scene node
  specs from `garden.structures/zones/plantings` (parents before children; siblings ordered by
  zIndex; `length`→`height`; plantings get derived square poses).
- `sceneToGarden(scene, base): Garden` — project the Scene back into `garden.structures/zones/
  plantings` (`height`→`length`; planting pose → `{x,y}`; reattach non-spatial garden fields from
  `base`: id, name, widthFt, gridCellSizeFt, displayUnit, groundColor, blueprint, **nursery**,
  **collection**, version).

Wiring: `src/utils/file.ts` load builds the Scene via `gardenToScene` (migrations still run on the
`.garden` object *before* conversion — unchanged); save calls `sceneToGarden` then serializes the
existing `.garden` JSON shape. **No change to the on-disk format**, so every saved file, the
localStorage autosave, and the migrations keep working.

## Undo swap

Replace `src/store/history.ts` (the `past[]`/`future[]` `structuredClone(garden)` snapshot stack)
with Scene history:

- Domain mutations go through `scene.add / remove / setPose / update / move / reorder`, each
  auto-undoable; compound edits wrap in `scene.batch('label', fn)` for one undo entry (mirrors
  today's `checkpoint()` boundary).
- `gardenStore.undo/redo/checkpoint` delegate to `scene.undo()/redo()/batch()`;
  `canUndo/canRedo` → `scene.canUndo()/canRedo()`. Set `historyLimit` to match today's cap.
- **Selection-after-undo.** Today undo also restores `selectedIds` and prunes dangling selection
  (`gardenStore` reconciles selection post-undo). Scene history does not track selection. Keep
  eric's post-undo selection-prune in `uiStore`, driven by a `scene.subscribe` listener that drops
  selected ids no longer in `scene.nodes`. (Exact selection-snapshot parity — restoring the *prior*
  selection on undo — is a minor behavior detail; match it via a parallel lightweight selection
  history if the parity test demands it.)

## React re-render & the gardenStore facade

- Canvas + components currently re-render via Zustand selectors on `gardenStore.garden`. With the
  Scene as truth, subscribe via `useScene` / `useSyncExternalStore(scene.subscribe, scene.getVersion)`.
- **Facade strategy.** Hundreds of readers call `useGardenStore(s => s.garden.structures)` etc.
  Keep a thin `gardenStore`-shaped **read facade** whose selectors derive `structures/zones/
  plantings` from the Scene (memoized per `scene.getVersion()`), so existing readers keep working
  unchanged during SP1. Mutation methods on the store delegate to Scene ops. Tightening/removing the
  facade is later (post-SP3) cleanup, not SP1.
- The garden canvas keeps its current `gardenScene` adapter + `dragPreview` rendering; point the
  adapter's data getters (`getStructures/getZones/getPlantings`) at the Scene-derived facade so the
  old render path is unchanged. (We do **not** adopt `SceneCanvas` here — that's SP2.)

## Optimizer boundary

`src/components/optimizer/runOptimizerForBed.ts` keeps converting `Structure` + `Cultivar[]` →
`OptimizationInput`. In SP1 it reads those from the Scene-derived facade (same `Structure` shape).
No Scene type crosses into `src/optimizer/`; `check:optimizer-boundary` stays green.

## Out of scope for SP1

- `SceneCanvas`, `useSelectTool`, the action model, kit preview layers (SP2).
- The nursery scene (SP3) — nursery stays in `garden.nursery`, persisted as today.
- Deleting `dragPreview` / the old gesture tool (SP2/SP4).
- Removing the `gardenStore` facade (post-SP3 cleanup).

## Open questions to resolve during implementation

- **Pin↔HEAD `Scene` delta (51 lines):** confirm none of the 51 changed lines touch the methods SP1
  uses (`add/setPose/update/move/batch/undo/subscribe/getVersion/childrenOf/renderOrder`). If they
  do, code against the HEAD signatures and accept a tiny shim on the pin.
- **Selection-history parity:** does any test assert that undo *restores the prior selection* (not
  just prunes dangling)? If yes, add a parallel selection ring; if no, prune-only suffices.
- **Container nesting depth:** confirm structures only nest one level (a structure under a structure)
  in practice; the Scene handles arbitrary depth either way, but the converter's ordering pass should
  be verified against real `.garden` fixtures.
- **`reorder`/zIndex write-back:** SP1 is read-equivalent; confirm no current code path mutates
  zIndex through a gesture (that would be SP2).

## Risks

- **Undo-model swap is the riskiest step.** Mitigation: land it behind the no-visible-change gate
  with explicit undo/redo + selection-prune tests before any SP2 gesture work; keep `history.ts`
  deletable only once parity tests pass.
- **Facade performance:** deriving arrays from the Scene on every version bump could regress render
  perf vs Zustand's structural sharing. Mitigation: memoize per `getVersion()`; if needed, maintain
  incremental derived arrays updated by `scene.subscribe`.
- **Hidden writers:** a store mutation missed in the delegation would silently diverge Scene from
  facade. Mitigation: route ALL `gardenStore` garden-domain mutations through Scene ops; grep for
  direct `set({ garden })` writes and convert each.
