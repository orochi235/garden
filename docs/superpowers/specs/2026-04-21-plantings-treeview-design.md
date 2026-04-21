# Plantings Treeview Design

## Summary

Replace the plantings section's grid layout with a collapsible treeview where each entry gets its own row. Species with one cultivar are leaf nodes; species with multiple cultivars are collapsible parent nodes. All rows sit on a single semitransparent container that scrolls if needed.

## Row Types

Three row types share a fixed-width column layout so icons align vertically:

| Column       | Width  | Parent row         | Leaf row           | Child row          |
|-------------|--------|--------------------|--------------------|---------------------|
| Disclosure  | ~16px  | ▶ / ▼ triangle     | blank spacer       | (part of indent)    |
| Icon        | ~28px  | Canvas species icon | Canvas species icon | —                   |
| Label       | flex   | Species name       | Species name       | Variety name        |
| Color dot   | —      | —                  | —                  | ~10px colored circle (in icon column area) |

**Child rows** are indented so the color dot aligns past the parent's icon column. The dot replaces the full canvas icon since the icon shape is identical within a species — only color varies.

### Column alignment

All species-level icons (on both parent and leaf rows) must sit in the same vertical column. Leaf rows reserve the same horizontal space for the disclosure triangle column even though it's empty. Child rows indent further so their color dot + label starts past the icon column.

## Behavior

- **Leaf rows** (single-cultivar species): draggable. Clicking does nothing special (same as current palette items — sets plotting tool or starts drag).
- **Parent rows** (multi-cultivar species): not draggable. Click toggles expand/collapse. Start collapsed.
- **Child rows** (cultivars under a multi-cultivar species): draggable.
- **Search**: filters against cultivar name, species name, and variety. A parent is shown if any of its children match; matched children are shown expanded.

## Visual Treatment

- All plantings rows render inside a single `div` with semitransparent background (`rgba(0,0,0,0.25)`), `backdrop-filter: blur(8px)`, and rounded corners — matching the existing card style but as one continuous container.
- `overflow-y: auto` on the container if content exceeds available height (thin scrollbar matching existing style).
- Canvas-rendered icons reuse the existing `PlantIcon` component at a smaller radius (~16px instead of 28px) to fit the row height.
- Row height: ~32px.
- Hover: subtle background highlight.
- Disclosure triangle: small (10-12px), `opacity: 0.5`, rotates on expand.

## Scope

### Changes
- `ObjectPalette.tsx` — render plantings section as treeview instead of grid
- `PaletteItem.tsx` — add row-style variants (leaf, parent, child) alongside existing grid style (used by structures/zones)
- `PaletteItem.module.css` — add row styles
- `ObjectPalette.module.css` — add treeview container styles

### No changes
- `paletteData.ts` — no data model changes; treeview is purely a rendering concern
- Structures and Zones sections — keep their current grid layout
- Search bar — stays as-is
- Drag behavior — same DnD mechanism, just applied to rows instead of grid cells
