# Garden → SceneCanvas migration: seam-by-seam design (2026-06-14)

> Migrate eric's **garden** canvas off bare `<Canvas>` onto weasel `<SceneCanvas>`.
> Nursery follows in a separate cycle (deferred — see Out of Scope).
> Supersedes the "STOP / XL-rewrite" framing in
> `docs/superpowers/plans/2026-06-14-scenecanvas-findings-and-font-fix.md` Part 2,
> with corrected facts (below).

## Why now (the real motivation)

Bare `<Canvas>` is being **retired as a weasel consumer surface** — it has caused
problems in other projects, and the cutover only gets harder as weasel diverges.
The font and overlay-slot motivations from the original plan are already moot
(fonts shipped independently via `tsup splitting:true`; overlay slots exist on both
backends). The remaining reason to migrate stands on its own: **get eric off the
surface weasel is sunsetting.**

## The correction that reframes everything

The findings doc treated this as a from-scratch XL data-model rewrite (point-pose
vs RectPose, custom adapter over Zustand, undo collision). That under-counted what
**B1 ("SP1 scene data core", landed 2026-06-13)** already built:

- `src/scene/gardenScene.ts` — a **real kit `Scene<GardenNodeData, GardenLayer, GardenPose>`**,
  with `GardenPose` already **RectPose-shaped** (`{x, y, width, height, rotation?, shape?}`).
- `src/scene/gardenConverters.ts` — `gardenToScene` / `sceneToGarden`, tested
  (`gardenConverters.test.ts`, `gardenScene.test.ts`, `gardenFixtureRoundtrip.test.ts`).
- `src/store/gardenStore.ts` — `composeGarden()` already makes the public `garden`
  a **read-projection of the Scene**. The ~hundreds of `useGardenStore(s => s.garden.…)`
  readers are unchanged.

So the data-model seam (the part the findings doc feared) is **largely done**. Two
things still make Zustand look authoritative: (a) mutations rebuild the Scene
*wholesale* (the "legacy bridge"; B1's "Task C"), and (b) snapshot-undo wraps the
Zustand `garden`. This migration finishes those and re-points the canvas.

> ⚠️ The `src/canvas/adapters/gardenScene.ts` file is a **different** thing — the
> point-pose (`ScenePose = {x,y}`) adapter the *live* bare `<Canvas>` consumes. It
> reads the composed `garden` arrays, not the B1 Scene. This is the adapter the
> migration replaces with the SceneCanvas-synthesized one. Don't confuse the two
> `gardenScene.ts` files.

## Operating principle (confirmed)

**Design a seam INTO weasel iff it's abstract / generally-useful in both backends;
otherwise BRIDGE it eric-side.** (Precedent: the `layoutRuns` text-align fix went
into weasel because alignment is backend-agnostic correctness, not an eric hack.)

**Bias (confirmed 2026-06-14):** for *spatial* concerns, lean toward weasel owning as
much as possible. **Custom weasel layers / tools / hooks are fair game** when they're a
cleaner fit than an eric-side bridge — adding a real public weasel surface beats keeping
domain glue in eric. Only the genuinely domain-specific rules (cultivar-driven footprints,
occupancy math) stay eric-side, because they need eric's data.

## Chosen architecture (confirmed)

**Scene-authoritative hybrid with snapshot-the-Scene undo:**

- The kit **Scene becomes the spatial store of record.** `<SceneCanvas scene={gardenScene}>`
  mutates it via ops; gestures route through `applyOps`.
- `gardenStore.garden` stays the **composed read-projection** — readers untouched.
  ("Zustand = source of truth" is preserved *in spirit*: the garden API is intact;
  the Scene is the underlying representation.)
- **Undo = snapshot the serialized Scene** (`scene.toJSON()`), restored **in place**
  via a new kit `scene.loadState()` (see weasel change below). Preserves eric's
  snapshot semantics including the nursery-overlay trick. Nursery undo is untouched.
- eric **adopts SceneCanvas's built-in select tool** for spatial gestures (default),
  vendoring an exception only for a REALLY bad fit (surfaced for discussion). It keeps
  its scalar zoom `View` and rich domain rendering, forwarded through SceneCanvas props.

## The one weasel change (Design-Into-Weasel)

**`Scene.loadState(serialized: SerializedScene): void`** — replace all nodes / layers
in the **existing** Scene instance from a snapshot, in place, without recreating the
instance. Today `scene.toJSON()` exists but the only way back is `sceneFromJSON()`,
which builds a **new instance with empty history** — unusable when `<SceneCanvas>`
holds the instance and reads `scene` only once.

This is abstract and generally useful (any consumer wanting snapshot-style undo, or
loading a document from disk into a live canvas, needs it), so it belongs in weasel.
Held for Mike's weasel sign-off like the align fix. It backs **both** undo-restore
and `.garden` file load (one code path).

- Semantics: clears `state.nodes` / `state.roots` / layer visibility+lock, rebuilds
  from the snapshot, bumps `getVersion()`, notifies subscribers. History stack is
  **not** part of the snapshot (consistent with `sceneFromJSON`); the caller's
  snapshot-undo stack owns history.
- Must trigger SceneCanvas's `useSyncExternalStore` re-render (version bump).

## Seam-by-seam sort

| # | Seam | Target under chosen arch | Verdict |
|---|------|--------------------------|---------|
| 0 | **Data model / converters / read-projection** | — | **Done (B1)** |
| 1 | **Spatial store of record** | `gardenStore` mutates the B1 Scene directly; `garden` stays the composed projection | **Bridge** (eric) |
| 2 | **Mutation path** (B1 Task C) | Replace wholesale `patch()`-rebuild with fine-grained kit ops via the SceneCanvas adapter's `applyOps` (transform/reparent/add/remove) | **Bridge** — ops are existing kit primitives |
| 3 | **Undo** | Snapshot serialized Scene; restore in place | **Design into weasel** — `scene.loadState()` (above). Nursery undo unchanged |
| 4 | **Planting footprints** (no stored W/H) | Keep deriving footprint from cultivar in the converter / `poseBounds`; stays cultivar-driven, not stored | **Bridge** (eric domain) |
| 5 | **Nested-container pose frame** | Converter emits **parent-local** poses for nested structures/zones (kit `decomposeRectPose`); full multi-level round-trip tests | **Bridge** — correctness fix (kit composes `world = parent + child`; eric currently emits world for nested structs/zones, masked today because the live canvas bypasses kit composition) |
| 6 | **Occupancy / drop-validity** | Pass eric's existing kit `LayoutStrategy` (`plantingLayout`) via SceneCanvas `layouts` prop; `cellOccupancy` stays eric | **Bridge** — already kit-shaped |
| 7 | **Gesture controllers** (~2558 LOC vendored in `src/canvas/gestures/`) | **Adopt SceneCanvas's built-in select tool** (public `selectTool` move/resize/rotate/area-select); feed it eric's `LayoutStrategy` + `snap` + `bounds`. **Vendor only the exceptions** — behaviors that can't map to a public knob, decided per-behavior; for those add a custom weasel tool / export a hook rather than bridge | **Mostly into weasel** — retires most of the 2558 LOC; eric supplies domain rules only |
| 8 | **Rendering layers** (~10 custom) | Use **kit selection chrome** (outline/handles) instead of eric's hand-rolled selection layers; keep only genuinely-domain layers (plant icons, fills, pills) reading the `garden` projection; suppress kit default scene slot (`scene: null`). Custom weasel layers OK where cleaner | **Lean weasel** — drop the duplicated selection layers |
| 9 | **Tools** | Adopt kit select tool (see #7); no `ToolsApi` takeover | **Into weasel** |
| 10 | **Selection** | Kit selection chrome (#8); selection *state* (`uiStore.selectedIds`) bridged via SceneCanvas `selection`/`selectionMode` | **Mostly weasel** |
| 11 | **View / camera** | `toKitView`/`fromKitView` forwarded | **Bridge** — unchanged |
| 12 | **Hit-testing** | Supply eric's footprint-aware pick/bounds via SceneCanvas's **`geometry`** prop (now consumed — no takeover) | **Bridge** — kit-native path |
| 13 | **`.garden` persistence** | Persist **`SerializedScene`** (+ non-spatial base) instead of garden arrays; add a load-time migration from the old garden-array format | **Bridge** — uses the same `loadState` path as undo |

**Net:** one definite Design-Into-Weasel item (#3 `loadState`), plus seams #7/#8/#9/#10
leaning hard into weasel (adopt kit gestures, selection chrome, select tool, selection
state). Bridges that remain are domain rules (#4, #6), the kit-native geometry hook
(#12), and unchanged view plumbing (#11). `cascadeContainerPose` is already a kit
`sceneToAdapter` option, so cascade moves need no weasel work.

### Why "weasel owns gestures" is viable now (dissolved blocker)

`weasel-pin` records eric vendoring gestures for two reasons: HEAD's gesture actions
were `@experimental`, and the preview-ghost/dispatcher overlay layer was **unexported**.
**Both dissolve under SceneCanvas:** SceneCanvas injects the preview-ghost/dispatcher
overlays internally, and re-exposes move/resize/rotate/snap/area-select as **public
`selectTool` props** (`SceneCanvas.tsx:353-365`) — a real public surface, not the
`@experimental` Action API. eric's bespoke drag behavior already lives in kit-shaped
structures (`plantingLayout.ts` is a `LayoutStrategy`; `findSnapTarget` returns a kit
`SnapTarget`), which is exactly what the built-in move tool consumes.

## Persistence format (seam #13 detail)

New `.garden` shape (illustrative): `{ ...base, scene: SerializedScene }` replacing
`{ ...base, structures, zones, plantings }`. `serializeGarden` writes `scene.toJSON()`
plus the non-spatial base; `deserializeGarden`:

1. Detect format: presence of `scene` key → new; `structures`/`zones`/`plantings` → legacy.
2. Legacy → run existing migrations (`migrateHeightToLength`, `stripLegacyFields`,
   `migrateLayoutsToCellGrid`, `snapPlantingsToCellGrid`, `hydrateCollection`), build a
   `Garden`, then `gardenToScene` → `loadState`.
3. New → `loadState(serialized)` directly; hydrate base.

Autosave (`localStorage`) uses the same serializer, so it migrates transparently.

## Implementation phases (ordered; garden only)

1. **weasel `Scene.loadState()`** + unit tests. Rebuild weasel; `rm -rf node_modules/.vite`.
   *(Held for Mike's weasel sign-off — do not commit weasel without it.)*
2. **Converter frame fix (#5)** — parent-local poses for nested structures/zones +
   round-trip tests. Independent of SceneCanvas; lands first as a correctness fix.
3. **Mutation path (#2)** — fine-grained scene ops replace the wholesale-rebuild bridge.
4. **Undo (#3)** — snapshot serialized Scene; `loadState` restore; nursery overlay intact.
5. **Persistence (#13)** — `SerializedScene` format + legacy migration + autosave.
6. **Canvas swap** — replace `<Canvas adapter=…>` with `<SceneCanvas scene=…>` in
   `CanvasNewPrototype.tsx`; wire `scene`, `layouts`, `selectTool` (move/resize/snap/
   area-select), `selection`, `view`, and a `layers` map that suppresses the default
   scene slot and the kit-duplicated selection layers (#8). Retire
   `src/canvas/adapters/gardenScene.ts` (the point-pose adapter).
7. **Gesture behavior-mapping audit (#7)** — enumerate eric's gesture behaviors
   (container snap-attraction, `cursorInside` drop guard, alt-cycle hit, cell-grid
   snap, snap-back on attraction-only release) and map each to a kit knob
   (`selectTool.move`, `snap`, `layouts`, `geometry`). **Default to adopting the kit
   for every behavior.** A behavior gets a workaround (custom weasel tool, exported
   hook, or a single vendored controller) **only when it's a REALLY bad fit — and that
   case is surfaced to Mike for discussion, not bridged silently.** Delete every
   vendored controller a kit knob covers.
8. **Verify** — gates + headless render proof; visual suite.

Each phase keeps all gates green before the next.

## Risks / open items

- **Gesture adoption (#7)** is the highest-LOC *deletion*; risk is behavior parity for
  the bespoke planting drag. Mitigate by keeping eric's gesture tests as the parity
  oracle while swapping the controller underneath. Any "REALLY bad fit" pauses for a
  Mike discussion (kit workaround vs. one vendored exception) before proceeding.
- **`loadState` must bump version** or SceneCanvas won't repaint on undo/load.
- **Nested-frame fix (#5)** must round-trip losslessly through the new persistence
  format, or saved nested gardens shift on load. Multi-level fixtures required.
- **weasel `splitting:true` sign-off** (the font fix) is still pending from the prior
  session and remains a prerequisite for the running build. Don't let weasel drift.

## Out of scope (deferred, separate cycles)

- **Nursery** SceneCanvas migration — computed auto-flow layout; do after garden proves
  the pattern.
- **MSDF text unification** — `~/src/weasel/HANDOFF-msdf-text-unification.md`. Orthogonal;
  sequence after, not folded in.
- **HEAD Action-API adoption** — eric keeps its vendored gestures (`weasel-pin`); the
  declarative `moveAction`/etc. are `@experimental`. Unchanged by this migration.

## Gates

`npx tsc -b` (ignore the 4 known `packages/history` TS2307 dts leaks), `npm run lint`,
`npm test` (791 baseline), `npm run test:visual` (4/4). Headless render proof per
`/tmp/verify-fonts.mjs` pattern (no focus steal). After any weasel rebuild:
`rm -rf ~/src/eric/node_modules/.vite` then restart `npm run dev`.

## Key references

- B1 design: `docs/superpowers/specs/2026-06-13-sp1-scene-data-core-design.md`
- Findings (superseded Part 2): `docs/superpowers/plans/2026-06-14-scenecanvas-findings-and-font-fix.md`
- `src/scene/gardenScene.ts`, `src/scene/gardenConverters.ts`, `src/store/gardenStore.ts:225-313`
- `src/canvas/adapters/gardenScene.ts` (point-pose adapter to retire),
  `src/canvas/CanvasNewPrototype.tsx:493-503` (the callsite)
- weasel: `src/canvas/SceneCanvas.tsx:283-409` (props), `src/canvas/sceneAdapter.ts`
  (`sceneToAdapter` options), `src/core/scene/scene.ts` (`toJSON`/`sceneFromJSON`;
  `loadState` to be added), `src/features/groups/composePose.ts` (`decomposeRectPose`)
</content>
</invoke>
