# Cultivar Registry Design

## Summary

Extract the concept of a plant type into a first-class `Cultivar` entity. Plantings reference a cultivar by ID instead of carrying duplicated species data inline.

## Cultivar Interface

```ts
interface Cultivar {
  id: string;            // stable key, e.g. 'tomato'
  name: string;          // display name, e.g. 'Tomato'
  taxonomicName: string; // e.g. 'Solanum lycopersicum'
  variety: string | null;
  color: string;         // default render color
  footprintFt: number;   // diameter in feet
  spacingFt: number;     // recommended spacing between plants
}
```

## Registry Module — `src/model/cultivars.ts`

Static array of known cultivars with lookup helpers:

- `getCultivar(id: string): Cultivar | undefined`
- `getAllCultivars(): Cultivar[]`

Not user-extensible for now.

## Planting Interface (revised)

```ts
interface Planting {
  id: string;
  parentId: string;
  cultivarId: string;   // references Cultivar.id
  x: number;            // relative to parent
  y: number;
  label: string;        // user-facing, defaults to cultivar name
  icon: string | null;
}
```

Removed fields (now derived from cultivar): `name`, `color`, `variety`, `spacingFt`, `footprintFt`.

## Downstream Changes

### `createPlanting`

Accepts `cultivarId` instead of `name`. Populates `label` from `getCultivar(cultivarId).name`.

### `paletteData.ts`

Planting palette entries derive `name` and `color` from the cultivar registry instead of hardcoding them.

### `renderPlantings.ts`

Resolves cultivar by `planting.cultivarId` to get `color`, `footprintFt`, and the renderer key.

### `plantRenderers.ts`

Dispatches on cultivar ID (matching `Cultivar.id`) instead of name string. The renderer map keys change from `'Tomato'` to `'tomato'` etc.

### `PaletteItem.tsx` — `PlantIcon`

Passes cultivar ID to `renderPlant` instead of name.

### `default.garden`

Replace per-planting `name`, `color`, `variety`, `spacingFt`, `footprintFt` fields with `cultivarId`. Remove `label` where it matches cultivar name (or keep as explicit override).

## Migration

Breaking format change. No versioning exists yet — `default.garden` is updated directly.

## Scope Boundary

- No user-defined cultivars
- No per-planting overrides of cultivar data
- No companion planting rules or growth data
