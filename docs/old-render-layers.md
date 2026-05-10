# Render Layers — archived snapshot (2026-05-10)

This is the layer catalog before we replace the bespoke `RenderLayersPanel`
with weasel's modal. Snapshot is for historical reference — the live source
of truth lives in each `*LayersWorld.ts` factory's `*_LAYER_DESCRIPTORS`
constant.

## Garden mode

### Structures (`STRUCTURE_LAYER_DESCRIPTORS`)

| id | label | flags |
|---|---|---|
| `structure-walls` | Structure Walls | — |
| `structure-bodies` | Structure Bodies | alwaysOn |
| `structure-surfaces` | Structure Surfaces | — |
| `structure-plantable-area` | Plantable Area | defaultVisible: false |
| `structure-highlights` | Structure Highlights | — |
| `structure-labels` | Structure Labels | — |

### Zones (`ZONE_LAYER_DESCRIPTORS`)

| id | label | flags |
|---|---|---|
| `zone-bodies` | Zone Bodies | alwaysOn |
| `zone-patterns` | Zone Patterns | — |
| `zone-highlights` | Zone Highlights | — |
| `zone-labels` | Zone Labels | — |

### Plantings (`PLANTING_LAYER_DESCRIPTORS`)

| id | label | flags |
|---|---|---|
| `container-overlays` | Container Overlays | — |
| `planting-conflicts` | Spacing Conflicts | — |
| `planting-spacing` | Planting Spacing | — |
| `planting-icons` | Planting Icons | alwaysOn |
| `planting-measurements` | Planting Measurements | defaultVisible: false |
| `planting-highlights` | Planting Highlights | — |
| `planting-labels` | Planting Labels | — |
| `container-walls` | Container Walls | — |

### Selection (`SELECTION_LAYER_DESCRIPTORS`)

| id | label | flags |
|---|---|---|
| `group-outlines` | Group Outlines | alwaysOn |
| `selection-outlines` | Selection Outlines | alwaysOn |
| `selection-handles` | Selection Handles | alwaysOn |

### System (`SYSTEM_LAYER_DESCRIPTORS`)

| id | label | flags |
|---|---|---|
| `system-origin` | System (origin) | alwaysOn |

### Debug (registered conditionally via `?debug=` flag, in `debugLayers.ts`)

| id | label | flags |
|---|---|---|
| `debug-hitboxes` | Debug: Hitboxes | alwaysOn |
| `debug-bounds` | Debug: Bounds | alwaysOn |
| `debug-axes` | Debug: Axes | alwaysOn |
| `debug-grid` | Debug: Grid | alwaysOn |

## Seed-starting mode

### Trays

| id | label | flags |
|---|---|---|
| `tray-body` | Tray Body | alwaysOn |
| `tray-wells` | Tray Wells | — |
| `tray-grid` | Tray Grid | defaultVisible: true |
| `tray-labels` | Tray Labels | alwaysOn |

### Seedlings

| id | label | flags |
|---|---|---|
| `seedlings` | Seedlings | alwaysOn |
| `seedling-labels` | Seedling Labels | defaultVisible: false |
| `seedling-fill-preview` | Seedling Fill Preview | alwaysOn |

## How they were grouped in the panel

`src/components/sidebar/RenderLayersPanel.tsx` maintained an explicit
`DESCRIPTOR_GROUPS` array (Structures / Zones / Plantings / Selection /
System) for garden mode, plus a fallback prefix-based matcher for runtime-
registered layers (Trays / Seedlings / Debug). Visibility lived in
`useUiStore.renderLayerVisibility` keyed by layer id. `alwaysOn` flags
suppressed the toggle for that row.
