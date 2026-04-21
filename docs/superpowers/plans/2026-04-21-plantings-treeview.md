# Plantings Treeview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plantings grid with a collapsible treeview where species are grouped, single-cultivar species are draggable leaf nodes, and multi-cultivar species expand to show cultivar children with color swatches.

**Architecture:** Pure rendering change in `ObjectPalette.tsx` and `PaletteItem.tsx`. A new `usePlantingTree` hook builds the tree data structure from `paletteData.ts` entries. CSS modules get new row-based styles alongside existing grid styles (structures/zones unchanged).

**Tech Stack:** React, CSS Modules, Canvas (existing `renderIcon`), Vitest

---

### Task 1: Build the `usePlantingTree` hook

**Files:**
- Create: `src/components/palette/usePlantingTree.ts`
- Create: `src/components/palette/usePlantingTree.test.ts`

This hook takes the filtered palette entries and groups them into a tree structure. Each node is either a "leaf" (single-cultivar species, directly draggable) or a "group" (multi-cultivar species, collapsible with children). It also manages expand/collapse state and auto-expands groups during search.

- [ ] **Step 1: Write the tree-building test**

```ts
// src/components/palette/usePlantingTree.test.ts
import { describe, expect, it } from 'vitest';
import { buildPlantingTree, type PlantingTreeNode } from './usePlantingTree';
import type { PaletteEntry } from './paletteData';

const makeEntry = (id: string, speciesId: string, speciesName: string, varietyLabel: string, color = '#000'): PaletteEntry => ({
  id,
  name: `${speciesName}${varietyLabel !== speciesName ? ', ' + varietyLabel : ''}`,
  category: 'plantings',
  speciesId,
  speciesName,
  varietyLabel,
  type: 'planting',
  defaultWidth: 0,
  defaultHeight: 0,
  color,
});

describe('buildPlantingTree', () => {
  it('single-cultivar species becomes a leaf node', () => {
    const entries = [makeEntry('carrot', 'carrot', 'Carrot', 'Carrot', '#E0943C')];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('leaf');
    expect(tree[0].speciesName).toBe('Carrot');
    if (tree[0].kind === 'leaf') {
      expect(tree[0].entry.id).toBe('carrot');
    }
  });

  it('multi-cultivar species becomes a group node', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato', '#E05555'),
      makeEntry('black-krim-tomato', 'tomato', 'Tomato', 'Black Krim', '#6B2D3A'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('group');
    if (tree[0].kind === 'group') {
      expect(tree[0].speciesName).toBe('Tomato');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].entry.id).toBe('black-krim-tomato');
      expect(tree[0].children[1].entry.id).toBe('tomato');
    }
  });

  it('sorts groups alphabetically by species name', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('basil', 'basil', 'Basil', 'Basil'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree[0].speciesName).toBe('Basil');
    expect(tree[1].speciesName).toBe('Tomato');
  });

  it('sorts children alphabetically by varietyLabel', () => {
    const entries = [
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('cherokee', 'tomato', 'Tomato', 'Cherokee Purple'),
      makeEntry('black-krim', 'tomato', 'Tomato', 'Black Krim'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree[0].kind).toBe('group');
    if (tree[0].kind === 'group') {
      expect(tree[0].children.map((c) => c.entry.id)).toEqual([
        'black-krim', 'cherokee', 'tomato',
      ]);
    }
  });

  it('mixes leaf and group nodes', () => {
    const entries = [
      makeEntry('carrot', 'carrot', 'Carrot', 'Carrot'),
      makeEntry('tomato', 'tomato', 'Tomato', 'Tomato'),
      makeEntry('black-krim', 'tomato', 'Tomato', 'Black Krim'),
    ];
    const tree = buildPlantingTree(entries);
    expect(tree).toHaveLength(2);
    expect(tree[0].kind).toBe('leaf');
    expect(tree[1].kind).toBe('group');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/palette/usePlantingTree.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `buildPlantingTree` and types**

```ts
// src/components/palette/usePlantingTree.ts
import { useMemo, useState, useCallback, useEffect } from 'react';
import type { PaletteEntry } from './paletteData';

export interface PlantingLeafNode {
  kind: 'leaf';
  speciesId: string;
  speciesName: string;
  entry: PaletteEntry;
}

export interface PlantingChildNode {
  entry: PaletteEntry;
}

export interface PlantingGroupNode {
  kind: 'group';
  speciesId: string;
  speciesName: string;
  /** The default species color (from first cultivar with variety === null, or first entry). */
  color: string;
  children: PlantingChildNode[];
}

export type PlantingTreeNode = PlantingLeafNode | PlantingGroupNode;

export function buildPlantingTree(entries: PaletteEntry[]): PlantingTreeNode[] {
  const bySpecies = new Map<string, PaletteEntry[]>();
  for (const e of entries) {
    if (e.category !== 'plantings' || !e.speciesId) continue;
    const list = bySpecies.get(e.speciesId) ?? [];
    list.push(e);
    bySpecies.set(e.speciesId, list);
  }

  const nodes: PlantingTreeNode[] = [];
  for (const [speciesId, items] of bySpecies) {
    const speciesName = items[0].speciesName ?? speciesId;
    if (items.length === 1) {
      nodes.push({ kind: 'leaf', speciesId, speciesName, entry: items[0] });
    } else {
      const sorted = [...items].sort((a, b) =>
        (a.varietyLabel ?? '').localeCompare(b.varietyLabel ?? ''),
      );
      const defaultEntry = items.find((e) => e.varietyLabel === speciesName) ?? items[0];
      nodes.push({
        kind: 'group',
        speciesId,
        speciesName,
        color: defaultEntry.color,
        children: sorted.map((e) => ({ entry: e })),
      });
    }
  }

  nodes.sort((a, b) => a.speciesName.localeCompare(b.speciesName));
  return nodes;
}

export function usePlantingTree(plantingEntries: PaletteEntry[], isSearching: boolean) {
  const tree = useMemo(() => buildPlantingTree(plantingEntries), [plantingEntries]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand all groups when searching, collapse when search clears
  useEffect(() => {
    if (isSearching) {
      setExpanded(new Set(
        tree.filter((n) => n.kind === 'group').map((n) => n.speciesId),
      ));
    } else {
      setExpanded(new Set());
    }
  }, [isSearching, tree]);

  const toggle = useCallback((speciesId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(speciesId)) {
        next.delete(speciesId);
      } else {
        next.add(speciesId);
      }
      return next;
    });
  }, []);

  return { tree, expanded, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/palette/usePlantingTree.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/palette/usePlantingTree.ts src/components/palette/usePlantingTree.test.ts
git commit -m "feat: add usePlantingTree hook for treeview grouping"
```

---

### Task 2: Add treeview row CSS styles

**Files:**
- Modify: `src/styles/PaletteItem.module.css`
- Modify: `src/styles/ObjectPalette.module.css`

Add CSS for the three row types (leaf, parent, child) and the treeview container. Keep existing grid styles intact for structures/zones.

- [ ] **Step 1: Add treeview container style to ObjectPalette.module.css**

Append to `src/styles/ObjectPalette.module.css`:

```css
/* Treeview container for plantings */
.treeContainer {
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--border-radius);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.25);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
.treeContainer::-webkit-scrollbar {
  width: 6px;
}
.treeContainer::-webkit-scrollbar-track {
  background: transparent;
}
.treeContainer::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.treeContainer::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
```

- [ ] **Step 2: Add row styles to PaletteItem.module.css**

Append to `src/styles/PaletteItem.module.css`:

```css
/* === Treeview row styles === */
.row {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  cursor: grab;
  transition: background 0.15s;
  user-select: none;
}
.row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.row:active {
  cursor: grabbing;
}
.rowParent {
  cursor: pointer;
}
.rowParent:active {
  cursor: pointer;
}
/* Fixed-width column for disclosure triangle */
.rowDisclosure {
  width: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.disclosureIcon {
  width: 10px;
  height: 10px;
  opacity: 0.5;
  transition: transform 0.15s ease;
}
.disclosureExpanded {
  transform: rotate(90deg);
}
/* Fixed-width column for species icon */
.rowIconCol {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rowPlantIcon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}
/* Color dot for child rows */
.rowColorDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Indent for child rows: disclosure (16px) + icon col (28px) + gap (4px) = 48px */
.rowChild {
  padding-left: 56px;
}
.rowLabel {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 6px;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors (CSS modules are not type-checked, but this confirms nothing else is broken)

- [ ] **Step 4: Commit**

```bash
git add src/styles/PaletteItem.module.css src/styles/ObjectPalette.module.css
git commit -m "feat: add treeview CSS for plantings palette rows"
```

---

### Task 3: Add row-style components to PaletteItem.tsx

**Files:**
- Modify: `src/components/palette/PaletteItem.tsx`

Add three new exported components: `PlantingLeafRow`, `PlantingParentRow`, `PlantingChildRow`. Keep the existing `PaletteItem` component unchanged (it's still used by structures/zones).

- [ ] **Step 1: Add the disclosure triangle SVG and small plant icon**

Add above the existing `PaletteItem` component in `src/components/palette/PaletteItem.tsx`:

```tsx
// After existing imports, add:
import type { PlantingGroupNode } from './usePlantingTree';

const SMALL_ICON_RADIUS = 14;

function SmallPlantIcon({ cultivarId, color }: { cultivarId: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const size = 32;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const cultivar = getCultivar(cultivarId);
    const iconType: IconType = cultivar?.icon ?? 'herb-sprig';
    renderIcon(ctx, iconType, SMALL_ICON_RADIUS, color);
    ctx.restore();
  }, [cultivarId, color]);

  return <canvas ref={canvasRef} className={styles.rowPlantIcon} width={32} height={32} />;
}

function DisclosureTriangle({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 10 10"
      className={`${styles.disclosureIcon}${expanded ? ` ${styles.disclosureExpanded}` : ''}`}
    >
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Add the three row components**

Append to `src/components/palette/PaletteItem.tsx`, after the `DisclosureTriangle` component:

```tsx
interface LeafRowProps {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function PlantingLeafRow({ entry, onDragStart, onDragEnd }: LeafRowProps) {
  return (
    <div
      className={styles.row}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.rowDisclosure} />
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={entry.id} color={entry.color} />
      </div>
      <span className={styles.rowLabel}>{entry.speciesName ?? entry.name}</span>
    </div>
  );
}

interface ParentRowProps {
  node: PlantingGroupNode;
  expanded: boolean;
  onToggle: () => void;
}

export function PlantingParentRow({ node, expanded, onToggle }: ParentRowProps) {
  return (
    <div
      className={`${styles.row} ${styles.rowParent}`}
      onClick={onToggle}
    >
      <div className={styles.rowDisclosure}>
        <DisclosureTriangle expanded={expanded} />
      </div>
      <div className={styles.rowIconCol}>
        <SmallPlantIcon cultivarId={node.children[0].entry.id} color={node.color} />
      </div>
      <span className={styles.rowLabel}>{node.speciesName}</span>
    </div>
  );
}

interface ChildRowProps {
  entry: PaletteEntry;
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function PlantingChildRow({ entry, onDragStart, onDragEnd }: ChildRowProps) {
  return (
    <div
      className={`${styles.row} ${styles.rowChild}`}
      draggable
      onDragStart={(e) => onDragStart(entry, e)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.rowColorDot} style={{ backgroundColor: entry.color }} />
      <span className={styles.rowLabel}>{entry.varietyLabel ?? entry.name}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/palette/PaletteItem.tsx
git commit -m "feat: add PlantingLeafRow, PlantingParentRow, PlantingChildRow components"
```

---

### Task 4: Wire up treeview in ObjectPalette.tsx

**Files:**
- Modify: `src/components/palette/ObjectPalette.tsx`

Replace the plantings grid rendering with the treeview. Structures and zones keep their existing grid layout.

- [ ] **Step 1: Replace the plantings section rendering**

Replace the entire content of `src/components/palette/ObjectPalette.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import styles from '../../styles/ObjectPalette.module.css';
import {
  PaletteItem,
  PlantingLeafRow,
  PlantingParentRow,
  PlantingChildRow,
} from './PaletteItem';
import {
  categories,
  type PaletteEntry,
  paletteItems,
} from './paletteData';
import { usePlantingTree } from './usePlantingTree';

interface Props {
  onDragStart: (entry: PaletteEntry, e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export function ObjectPalette({ onDragStart, onDragEnd }: Props) {
  const [search, setSearch] = useState('');
  const { theme, transitionDuration: dur } = useActiveTheme();
  const filtered = search
    ? paletteItems.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : paletteItems;

  const plantingEntries = useMemo(
    () => filtered.filter((item) => item.category === 'plantings'),
    [filtered],
  );
  const { tree, expanded, toggle } = usePlantingTree(plantingEntries, search.length > 0);

  return (
    <div className={styles.palette}>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search objects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scrollArea}>
        {categories.map((cat) => {
          const items = filtered.filter((item) => item.category === cat.id);
          if (items.length === 0) return null;

          if (cat.id === 'plantings') {
            return (
              <div key={cat.id} className={styles.category}>
                <div
                  className={styles.categoryLabel}
                  style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
                >
                  {cat.label}
                </div>
                <div className={styles.treeContainer}>
                  {tree.map((node) => {
                    if (node.kind === 'leaf') {
                      return (
                        <PlantingLeafRow
                          key={node.entry.id}
                          entry={node.entry}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                        />
                      );
                    }
                    const isExpanded = expanded.has(node.speciesId);
                    return (
                      <div key={node.speciesId}>
                        <PlantingParentRow
                          node={node}
                          expanded={isExpanded}
                          onToggle={() => toggle(node.speciesId)}
                        />
                        {isExpanded &&
                          node.children.map((child) => (
                            <PlantingChildRow
                              key={child.entry.id}
                              entry={child.entry}
                              onDragStart={onDragStart}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div key={cat.id} className={styles.category}>
              <div
                className={styles.categoryLabel}
                style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
              >
                {cat.label}
              </div>
              <div className={styles.itemGrid}>
                {items.map((item) => (
                  <PaletteItem
                    key={item.id}
                    entry={item}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Visual check in browser**

Run: `npm run dev`
Open the app, verify:
1. Structures and Zones still render as grids
2. Plantings section shows a single semitransparent container
3. Single-cultivar species (Carrot, Cucumber, etc.) show as leaf rows with icon
4. Multi-cultivar species (Tomato, Pepper Hot, etc.) show as collapsible parents
5. Clicking a parent row expands/collapses its children
6. Children show color dots instead of icons
7. All species-level icons align vertically
8. Dragging leaf rows and child rows works as before
9. Search filters and auto-expands matching groups

- [ ] **Step 4: Commit**

```bash
git add src/components/palette/ObjectPalette.tsx
git commit -m "feat: wire up plantings treeview in ObjectPalette"
```

---

### Task 5: Clean up unused code

**Files:**
- Modify: `src/components/palette/paletteData.ts`

The `getPlantingSpeciesGroups` function is no longer used (the treeview hook handles grouping). Remove it.

- [ ] **Step 1: Verify `getPlantingSpeciesGroups` has no remaining callers**

Run: `grep -r "getPlantingSpeciesGroups" src/`
Expected: only the definition in `paletteData.ts` (no imports elsewhere)

- [ ] **Step 2: Remove `getPlantingSpeciesGroups`**

Delete the function and its JSDoc comment from `src/components/palette/paletteData.ts` (lines 139-150).

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/palette/paletteData.ts
git commit -m "refactor: remove unused getPlantingSpeciesGroups"
```
