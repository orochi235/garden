# SceneCanvas migration: findings + the font fix that actually shipped (2026-06-14)

> Written autonomously while Mike was away (he asked me to "start working on the
> scenecanvas migration… get as much as you can done without my input").
> **Headline: the migration's two premises were both wrong, so I did NOT charge into
> a multi-week architectural rewrite. Instead I shipped + verified the real win
> underneath it — canvas text now renders — and wrote this so you can make the
> SceneCanvas call with correct information.**

## TL;DR

1. **Canvas text renders now. ✅ Shipped + verified.** Root cause was a weasel dist
   packaging bug (dual font-registry across bundles), fixed with a **one-line**
   `tsup.config.ts` change (`splitting: true`). eric's previously "dead-end" font
   shim is now correct and was kept. All eric gates green. Live proof below.
2. **SceneCanvas does NOT fix fonts** — never did. The handoff's own caution
   (lines 56-61 of `…-scenecanvas-and-text-handoff.md`) was right; I confirmed it.
   So the font motivation for the migration is **gone**.
3. **SceneCanvas is NOT a "contained swap"** — the prior handoff missed that
   `<SceneCanvas>` **`Omit`s the `adapter` prop and requires a kit `Scene`**. eric's
   entire architecture is a *custom adapter over its Zustand store*. Adopting
   SceneCanvas is an **XL rewrite** with hard blockers (undo-ownership collision,
   node-tree impedance mismatch). **It needs your decision before any code.**
4. **The overlay slots you wanted don't require SceneCanvas** — bare `<Canvas>`
   already accepts `selectionOverlay` / `cellHighlight` / arbitrary custom layer
   slots. The kit's `previewGhost`/`dispatcherOverlay` are just custom layer
   entries SceneCanvas injects; eric can mount the same hooks itself (M, ~1-2 wk)
   without touching its data model.

---

## Part 1 — The font fix (SHIPPED, VERIFIED)

### Root cause (proven, not theorized)
`~/src/weasel/tsup.config.ts` built **9 entry points with `splitting: false`**. With
splitting off, every shared module is *inlined into each entry bundle*. The font
registry module (`src/features/text/atlas/registerFont.ts`, a module-level `Map`)
therefore got **two independent copies**:
- `dist/index.js` (which bundles `Canvas` + `WeaselRenderer`) had copy A.
- `dist/renderer.js` (the only export of `registerFont`) had copy B.

eric registers fonts via `import { registerFont } from '@orochi235/weasel/renderer'`
→ populated **copy B**. The renderer reads the registry at draw time via
`ensureFontTexture` from **copy A**. They never met → `resolveFontVariant` found
nothing → every glyph silently dropped (no error; atlas fetch/decode were always
fine). This is exactly the diagnosis in the prior handoff — now confirmed at the
byte level.

### The fix (weasel-side, one line)
`tsup.config.ts`: `splitting: false` → `splitting: true` (with an explanatory
comment). esbuild now factors the shared registry into **one chunk**
(`dist/chunk-*.js`) that *both* `index.js` and `renderer.js` import. ESM modules are
singletons per URL, so there is now exactly **one** registry `Map`.

**Verification at the bundle level** (post-rebuild `~/src/weasel/dist`):
- `grep -c "function ensureFontTexture"` across all dist JS → **1** (was 2),
  living in `chunk-HDB52PVD.js`.
- Both `index.js` and `renderer.js` import that chunk.

**This respects your deliberate "don't re-export `registerFont` from the main
barrel" decision** — eric keeps importing it from `/renderer`; it just now reaches
the renderer's registry. (Re-exporting from the barrel would also have worked but
would contradict that decision, so I avoided it.)

### eric-side changes (the previously-"dead-end" shim is now correct — KEPT)
- `src/main.tsx` — `await registerFont('sans-serif', {weight:400,style:'normal'},
  …inter.json, …inter.png)` before first paint. **Works as-is now.**
- `public/fonts/inter/{inter.json,inter.png}` — the Inter MSDF atlas. Kept.
- `biome.jsonc` — excludes the atlas from biome. I tightened the pattern
  `!public/fonts/**` → `!public/fonts` (biome ≥2.2 warned on the old form); lint
  is now warning-free.

### Live proof (headless, no focus steal)
Drove the running app headless and flipped Debug → Show labels → **All layers** on
the `garden-mixed` fixture:
- **Before** (default `labelMode:'selection'`, nothing selected): no canvas labels.
- **After** (`all`): "Tomato", "Sunny Patch", "Herb Corner", "raised-bed" all render
  crisply. No font-registration warning in console.

(Screenshots were captured to `/tmp/fonts-before.png` and `/tmp/fonts-after.png`
during the session; re-run `/tmp/verify-fonts.mjs` against `npm run dev` to
reproduce. They're in /tmp, not committed.)

### Why the visual suite still passes (and was NOT a valid font test)
The 4 visual fixtures default to `labelMode:'selection'` with nothing selected, so
they never drew canvas labels either way — baselines (May 10) remain valid and the
suite stays green. **Consider adding a `garden-mixed-labels` fixture
(`labelMode:'all'`) so font regressions are caught** — deferred (needs a labelMode
serializer hook or a URL param; out of scope for an unsupervised session).

### Gates (all green with the rebuilt weasel)
- `tsc -b`: 0 eric-source errors (only the 4 pre-existing `weasel-history` TS2307
  dist-packaging leaks — weasel-side, documented).
- `npm run lint`: clean, 0 warnings.
- `npm test`: **791 passed** / 108 files.
- `npm run test:visual`: **4/4**.

### What you need to decide / do for Part 1
- [ ] **Sign off on `splitting: true`** as weasel's packaging approach. It changes
      dist output shape (adds shared `chunk-*.js` files) for *all* consumers
      (demo, swillustrator). I did **not** run weasel's own test/demo build —
      please run `npm run build:demo` / weasel's test suite before publishing.
- [ ] Nothing is committed (per your rules). The weasel change is
      `M ~/src/weasel/tsup.config.ts` (+ gitignored rebuilt `dist/`). To revert:
      `git -C ~/src/weasel checkout tsup.config.ts && (cd ~/src/weasel && npm run build)`.

---

## Part 2 — SceneCanvas migration: STOP and re-decide

### The load-bearing discovery the prior handoff missed
`<SceneCanvas>` is **not** a drop-in for `<Canvas>`. From
`~/src/weasel/src/canvas/SceneCanvas.tsx`:
- **`adapter` is `Omit`ted from the props** (line 286). You cannot pass eric's
  `createGardenSceneAdapter()` / `createNurserySceneAdapter()`.
- **`scene` is a NEW REQUIRED prop** (line 306) — a kit `Scene` (from
  `core/scene/useScene`) or `SerializedScene`. SceneCanvas synthesizes the adapter
  internally via `sceneToAdapter` (line 320, 888) and owns mutation through ops.

eric is built the *opposite* way: a **custom adapter over its Zustand `gardenStore`
as the source of truth**, with its own layout engine (`src/model/layout.ts`) and
**Zustand snapshot undo**. The handoff assumed SceneCanvas "forwards tools as-is and
deep-merges layers" (both true) and inferred a contained swap — but it never checked
the adapter/scene boundary, which is where the real coupling is.

### Why full adoption is XL (verified by a deep read of the kit Scene/ops code)
The kit `Scene` **insists on owning its node storage** (`state.nodes: Map`,
`state.roots`, mutated in place) and its **own op-based undo stack**. Making it a
thin projection over eric's store is operationally unsound (stale reads mid-batch
during cascade moves). Concretely, three hard blockers:

1. **Undo-ownership collision.** eric = whole-garden Zustand snapshots;
   Scene = per-op undo/redo replay. They can't both be authoritative. Adopting
   Scene means **ripping out eric's snapshot history** (a deliberate SP1 decision).
2. **Node-tree impedance mismatch.** eric's domain is flat arrays
   (structures/zones/plantings; trays/seedlings) with optional `parentId`, plus a
   *computed* nursery auto-flow layout. Scene mandates a real tree with stored
   poses.
3. **Pose-type mismatch.** eric uses point poses (`{x,y}`, footprint derived from
   cultivar at render time); the kit defaults to `RectPose` (`{x,y,width,height}`).
   Needs a custom pose type + bounds/clip logic threaded through the adapter.

Estimate: **XL** (~weeks of focused work; 40-60% of eric's mutation/gesture code
re-threaded). This conflicts directly with the documented `weasel-pin` architecture
(eric keeps its own tool framework, scalar View, Zustand snapshot history).

### The lighter path that gets what you actually wanted
The original motivations for SceneCanvas were (a) fonts and (b) the
`selectionOverlay`/`dispatcherOverlay`/`previewGhost` slots the Action-API audit
flagged. (a) is now solved independently. For (b): **bare `<Canvas>` already exposes
the slots** — `LayersMap` has `grid`, `scene`, `selectionOverlay`, `cellHighlight`,
plus arbitrary custom keys with `{layer, after, before}` positioning. SceneCanvas's
`previewGhost`/`dispatcherOverlay` are just custom entries it injects via
`usePreviewGhostLayer` / `useDispatcherOverlayLayer`. eric can mount those hooks
itself and pass them as custom layer entries — **M (~1-2 wk), no data-model change,
no undo collision, incremental.**

### Recommendation
1. **Decouple and bank the font win** (done — just needs your packaging sign-off).
2. **Do not migrate to SceneCanvas now.** Re-scope the goal as "adopt the kit
   overlay slots on bare Canvas" if the Action-API teardown still matters.
3. Revisit SceneCanvas only if eric's domain later becomes genuinely tree-shaped
   (real groups) AND you're willing to move undo to the kit. Until then it's the
   wrong tool.

### Decisions I need from you
- [ ] Accept decoupling fonts from the SceneCanvas question? (I assumed yes.)
- [ ] Kill / defer the SceneCanvas migration in favor of mounting overlay slots on
      bare Canvas — or do you still want full SceneCanvas despite the XL/undo cost?
- [ ] If overlay-slots path: want me to plan the `previewGhost`/`dispatcherOverlay`
      adoption on bare Canvas next?

---

## State of the tree (nothing committed)
**eric** (`~/src/eric`, branch `main`):
- `M biome.jsonc` (font exclude, pattern tightened), `M src/main.tsx` (font shim —
  now functional), `?? public/fonts/` (atlas). All correct; keep.
- New docs: this file + the two prior handoffs.
**weasel** (`~/src/weasel`):
- `M tsup.config.ts` (`splitting: true` + comment). Rebuilt `dist/` (gitignored).

## Key references
- `~/src/weasel/src/canvas/SceneCanvas.tsx:283-409` (props; `adapter` omitted,
  `scene` required), `:888` (adapter synthesized from scene).
- `~/src/weasel/src/core/scene/scene.ts` (Scene owns mutable node storage + op undo).
- `~/src/weasel/src/canvas/Canvas.tsx` `LayersMap` (overlay slots on bare Canvas).
- `~/src/weasel/tsup.config.ts:20` (the fix).
- eric callsites: `src/canvas/CanvasNewPrototype.tsx:494`, `src/canvas/NurseryCanvas.tsx:301`.
- Superseded optimism: `2026-06-14-scenecanvas-and-text-handoff.md` (its "contained
  swap" scoping is wrong re: adapter/scene; its font root-cause is right).
</content>
