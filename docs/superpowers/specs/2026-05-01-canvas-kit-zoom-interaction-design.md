# canvas-kit `useZoomInteraction` Design

**Status:** Spec — implementation deferred.
**Date:** 2026-05-01
**Authors:** Mike

## Goal

canvas-kit already owns all the zoom math:

- `ViewTransform.zoom` lives on the view transform.
- `worldToScreen` / `screenToWorld` are zoom-aware.
- `wheelHandler` (`computeWheelAction`) implements wheel-to-zoom with
  focal-point preservation.

What's missing is a **central hook that owns the zoom level and dispatches
across input sources** (wheel, keyboard, double-click, pinch). Every consumer
today reinvents the wiring — clamp policy, `+`/`-` keys, focal-point math
duplicated alongside the wheel handler. `useZoomInteraction` collects all of
that into one stateless coordinator that mirrors the shape of
`usePanInteraction`.

## Non-goals

- **Animated/inertial zoom.** The hook snaps to the new value; if smoothing
  is wanted later it lives outside (a wrapper that interpolates `setZoom`).
- **Zoom-to-fit / zoom-to-selection.** That's `useAutoCenter`'s territory
  (and a future `zoomToSelection` action). Out of scope here.
- **Rotation or skew.** This is a 1D zoom hook.
- **Per-axis zoom.** No real-world driver. If we ever need it, it gets a
  separate hook (Tier 2.5 follow-up).

## Hook shape

`useZoomInteraction` is **stateless** — exactly like `usePanInteraction`. The
caller owns `useState` for `zoom` and `pan`; the hook receives the current
values plus setters and produces handlers the caller wires onto their canvas.

```ts
export interface UseZoomInteractionOptions {
  /** Current zoom (read at every event). */
  zoom: number;
  setZoom: (next: number) => void;
  /** Current pan (read at every event). Required because focal-point zoom
   *  also moves pan. */
  pan: { x: number; y: number };
  setPan: (next: { x: number; y: number }) => void;

  /** Hard clamp bounds. Default min=0.1, max=10. If min === max, zoom is
   *  locked (every change is a no-op). */
  min?: number;
  max?: number;

  /** Multiplicative wheel step. Default 1.1 (one wheel notch ≈ 10% zoom). */
  wheelStep?: number;
  /** Multiplicative key step. Default 1.25. */
  keyStep?: number;

  /** Viewport size, used to compute the focal point for keyboard zoom and
   *  for `zoomTo(level)` without an explicit focal. Required when `keys`
   *  is enabled or `zoomTo` is used without a focal arg; otherwise optional. */
  viewport?: { width: number; height: number };

  /** Per-source enable flags. */
  sources?: {
    wheel?: boolean;       // default true
    keys?: boolean;        // default true ('+' / '-' / '=' / '_')
    doubleClick?: boolean; // default false  (Photoshop-ish, not Figma)
    pinch?: boolean;       // default true   (where supported — see §Pinch)
  };

  /** When false (default), all wheel events zoom. When true, wheel only
   *  zooms while ctrlKey or metaKey is held — bare wheel is left to the
   *  caller (typical Figma/Sketch trackpad-pan idiom). Pinch (`wheel +
   *  ctrlKey` synthesised by macOS trackpad) ALWAYS zooms regardless. */
  wheelRequiresModifier?: boolean;
}

export interface UseZoomInteractionReturn {
  /** Wheel handler. No-op when `sources.wheel === false` (and not pinch). */
  onWheel(e: WheelEvent | React.WheelEvent): void;
  /** Keyboard handler. No-op when `sources.keys === false` or the event
   *  target is an editable element. */
  onKeyDown(e: KeyboardEvent | React.KeyboardEvent): void;
  /** Double-click handler. No-op when `sources.doubleClick === false`. */
  onDoubleClick(e: MouseEvent | React.MouseEvent): void;

  /** Imperative zoom centered on a focal point. Without `focal`, uses
   *  viewport center (requires `options.viewport`). */
  zoomTo(level: number, focal?: { x: number; y: number }): void;
  /** Multiplicative variant. `factor > 1` zooms in. */
  zoomBy(factor: number, focal?: { x: number; y: number }): void;

  /** Reset zoom to 1, pan to {0, 0}. */
  reset(): void;
}
```

The hook is a thin coordinator. It does not call `useState`. It does not
ref-cache `zoom` or `pan` — every handler reads the latest values from the
options object passed in on the current render (same pattern as
`usePanInteraction`'s `getActive`).

## Clamp policy

**Hard clamp on every change.** Every code path that produces a candidate
zoom value funnels through:

```ts
const clamp = (z: number, min: number, max: number) =>
  Math.min(max, Math.max(min, z));
```

`setZoom` is always called with the clamped value. If `min === max`,
`clamp` collapses to that constant — every wheel/key/dbl-click is a no-op.
This is the documented way to "lock" zoom.

Default range: `min = 0.1`, `max = 10` (i.e. 10% to 1000%). Consumers pass
their own when they want different bounds (e.g. the seed-starting view uses
`{ min: 0.5, max: 4 }`).

## Focal-point convention

The "world point under the focal stays under the focal" invariant is the
core of zoom-with-focal. The math (canvas-local coords; `pan` in screen
pixels):

```ts
const oldZoom = zoom;
const newZoom = clamp(next, min, max);
const k = newZoom / oldZoom;
const newPan = {
  x: fx - (fx - pan.x) * k,
  y: fy - (fy - pan.y) * k,
};
setZoom(newZoom);
setPan(newPan);
```

This is the same formula `computeWheelAction` already uses, written in
delta-form. Per-source focal:

| Source           | Focal point                                                  |
| ---------------- | ------------------------------------------------------------ |
| `onWheel`        | Pointer position in canvas-local coords (clientX/Y minus the canvas's bounding rect — see §Coords). |
| `onKeyDown`      | Viewport center: `{ x: viewport.width/2, y: viewport.height/2 }`. Requires `options.viewport`. |
| `onDoubleClick`  | Click position in canvas-local coords.                       |
| `zoomTo(level)`  | Argument when given; viewport center otherwise (requires `options.viewport`). |
| `zoomTo(level, focal)` | Argument.                                              |
| `zoomBy(factor)` / `zoomBy(factor, focal)` | Same as `zoomTo`.                  |
| `reset()`        | N/A — zoom snaps to 1, pan snaps to {0, 0}.                  |

### Coords

The hook does not own a canvas ref. For wheel/dblclick the focal is read from
the event using `e.currentTarget.getBoundingClientRect()` (events come from
the canvas the consumer wired the handlers onto). Concretely:

```ts
function focalFromEvent(e: { clientX: number; clientY: number; currentTarget: Element }) {
  const rect = (e.currentTarget as Element).getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
```

This keeps the hook ref-free. (If a consumer needs a different element as the
coord origin, they can call `zoomTo` / `zoomBy` directly with their own focal.)

## Source enumeration

Each input source is opt-in via `sources`. Defaults aim for "common editor"
expectations — wheel and keys on, pinch on, double-click off:

| Source        | Default | Rationale                                                    |
| ------------- | ------- | ------------------------------------------------------------ |
| `wheel`       | `true`  | The default zoom gesture in nearly every desktop editor.     |
| `keys`        | `true`  | `+` / `-` is the universal keyboard zoom in editors.         |
| `pinch`       | `true`  | macOS trackpad pinch is "wheel + ctrlKey"; almost always wanted. |
| `doubleClick` | `false` | Photoshop-style ("eyedrop" / "tool action"), not Figma's "fit-to" — turning on by default would break too many existing behaviors. |

A consumer can enable just keyboard zoom and a custom focal:

```ts
useZoomInteraction({
  zoom, setZoom, pan, setPan, viewport,
  sources: { wheel: false, keys: true, doubleClick: false, pinch: false },
});
```

## Pinch handling

macOS trackpad pinch is reported by browsers as a `WheelEvent` with
`ctrlKey: true` and small `deltaY`. There's no separate "pinch" event for the
hook to subscribe to.

The hook treats **`wheel + ctrlKey` as zoom unconditionally**, regardless of
`wheelRequiresModifier`. This is the only sane way to support trackpad pinch
without forcing consumers to inspect events themselves. `sources.pinch =
false` disables this — the hook ignores wheel events with ctrlKey when
`pinch` is off (consumer can re-handle them).

In all pinch paths, `event.preventDefault()` is called so the OS doesn't
zoom the whole page (Safari's default behavior).

## Modifier sniff (wheel)

Two operating idioms exist:

1. **All-wheel-zooms** (Photoshop, Inkscape). `wheelRequiresModifier = false`
   (default). Every wheel event zooms.
2. **Modifier-required-zoom** (Figma, Sketch). `wheelRequiresModifier = true`.
   Bare wheel pans (the consumer handles bare wheel themselves —
   `onWheel` returns without calling `setZoom`/`setPan`); only
   `ctrlKey` or `metaKey` + wheel zooms.

The trade-off:

- `false` is simpler and matches "canvas-kit is for editor-style apps."
- `true` integrates better with apps that already use bare wheel for pan.

In **both** modes, `wheel + ctrlKey` (pinch) zooms.

## Keyboard handling

Keys handled when `sources.keys === true`:

| Key         | Action                                              |
| ----------- | --------------------------------------------------- |
| `+` / `=`   | `zoomBy(keyStep)` — focal at viewport center        |
| `-` / `_`   | `zoomBy(1 / keyStep)` — focal at viewport center    |
| `0` (with meta/ctrl) | `reset()` — Cmd-0 / Ctrl-0 restores 100%   |

`+` and `=` share a key on US layouts (Shift+= → +); we accept both raw
keys to avoid forcing the consumer to handle Shift specially. Same for
`-` / `_`.

The handler ignores events when `e.target` is an editable element
(`HTMLInputElement`, `HTMLTextAreaElement`, or `[contenteditable]`) so the
canvas doesn't hijack zoom keys while the user is typing in an inspector.

## Double-click handling

Off by default. When `sources.doubleClick === true`:

- Plain dbl-click → `zoomBy(keyStep, focal)` — zoom in, focal at click point.
- `Shift`-dbl-click → `zoomBy(1 / keyStep, focal)` — zoom out, same focal.
- `Alt`-dbl-click → `reset()` (escape hatch when zoomed deep, mirrors
  Photoshop's Alt-double-click-tool reset).

## `reset()`

Imperative. Sets zoom to **1** and pan to **{0, 0}**. Hard-coded for now —
not configurable.

When we add `initialZoom`/`initialPan` (likely tied to `useAutoCenter`'s fit
result), `reset()` will restore those. Tracked as a follow-up; current call
sites that auto-center can re-fit by re-running `useAutoCenter` after
`reset()`. Document this gotcha.

## Composition with sibling hooks

```
┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ useAutoCenter│ → │ usePanInteraction│ ← │ useZoomInteraction │
│  (initial    │   │  (drag-pan)      │   │  (wheel/key/dbl/   │
│   fit ONCE)  │   │                  │   │   pinch zoom +     │
└──────────────┘   └──────────────────┘   │   focal-aware pan) │
                                          └────────────────────┘
```

- **`useAutoCenter`** writes initial `zoom` and `pan` once, when viewport
  first has size. After that it does nothing.
- **`usePanInteraction`** updates `pan` only.
- **`useZoomInteraction`** updates `zoom` AND `pan` (focal-aware zoom moves
  pan to keep the world point under the focal stationary).

The three hooks are independent — they share state only through the
caller's `zoom` / `pan` `useState`. There is no "view transform store" they
all read; the consumer owns the transform.

## Out of scope (future)

- Animated zoom (interpolated `setZoom` over time).
- `useAutoCenter`-style fit-to-bounds via `zoomTo({ bounds })`.
- `initialZoom`/`initialPan` as `reset()` targets.
- Per-axis zoom.
- Touch-events two-finger pinch (separate from trackpad). Browsers don't
  surface this as `WheelEvent` — it's `TouchEvent` with two pointers. We can
  add a `pinchTouch` source later if iPad/touchscreen support is needed.

## Testing strategy

Unit tests in `src/canvas-kit/hooks/useZoomInteraction.test.ts`, mirroring
`usePanInteraction.test.ts` (`renderHook`, `act`, fake events). Focus:

1. Clamp invariant — `setZoom` always called within `[min, max]`.
2. Focal invariant — for each source, `screenToWorld(focal, before) ===
   screenToWorld(focal, after)` after the zoom is applied (i.e. world point
   under focal stays put).
3. Source gating — handlers no-op when their `sources.*` flag is false.
4. Pinch override — `wheel + ctrlKey` zooms even when
   `wheelRequiresModifier === false` AND when it's `true`.
5. Editable-target sniff — keyboard handler skips when target is input/textarea/contenteditable.
6. `reset()` — zoom→1, pan→{0,0}.
7. `min === max` — every change is a no-op; pan also stays put (because k=1).

## Relationship to `computeWheelAction`

`computeWheelAction` (in `wheelHandler.ts`) implements the same focal-point
math, but it operates on a different convention:

- `computeWheelAction` treats zoom as a **percentage** (defaults
  `MIN_ZOOM=10`, `MAX_ZOOM=200`).
- `useZoomInteraction` treats zoom as a **multiplier** (defaults `min=0.1`,
  `max=10`).

This is consistent with the rest of canvas-kit (`ViewTransform.zoom` is a
multiplier; `worldToScreen` multiplies by it). `useZoomInteraction` does
**not** delegate to `computeWheelAction`. Instead it inlines the focal-point
formula (a 5-line expression) directly. `wheelHandler.ts` is preserved
unchanged so existing callers keep working; new code should prefer the hook.

A future cleanup pass can normalize `computeWheelAction` to the multiplier
convention and have the hook delegate. Tracked as a TODO.

## Migration

No callers exist today; the hook is purely additive.
