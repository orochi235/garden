import type { MoveAdapter, SnapTarget } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { Seedling, SeedStartingState, Tray } from '../../model/seedStarting';
import { getCell } from '../../model/seedStarting';
import { cellCenterInches, hitTestCellInches } from '../seedStartingHitTest';

export interface ScenePose { x: number; y: number }

export interface TrayNode { kind: 'tray'; id: string; data: Tray }
export interface SeedlingNode { kind: 'seedling'; id: string; data: Seedling }
export type SeedNode = TrayNode | SeedlingNode;

export type SeedStartingSceneAdapter = MoveAdapter<SeedNode, ScenePose> & {
  hitTest(worldX: number, worldY: number): SeedNode | null;
  hitAll(worldX: number, worldY: number): SeedNode[];
  getChildren(parentId: string): string[];
  getSelection(): string[];
  setSelection(ids: string[]): void;
};

/** Gap between trays (both axes) in the auto-flow seed-starting world layout. */
export const TRAY_GUTTER_IN = 2;
/** Number of trays per column before wrapping to a new column. */
export const TRAYS_PER_COLUMN = 3;

/**
 * Column-major layout: trays fill the first column top-to-bottom up to
 * `TRAYS_PER_COLUMN`, then wrap to a new column. Each column's width is the
 * max width of its members. Single-tray gardens get `(0, 0)`.
 */
export function trayWorldOrigin(tray: Tray, ss: SeedStartingState): { x: number; y: number } {
  const idx = ss.trays.findIndex((t) => t.id === tray.id);
  if (idx < 0) return { x: 0, y: 0 };
  const col = Math.floor(idx / TRAYS_PER_COLUMN);
  const row = idx % TRAYS_PER_COLUMN;

  let x = 0;
  for (let c = 0; c < col; c++) {
    let colWidth = 0;
    for (let r = 0; r < TRAYS_PER_COLUMN; r++) {
      const t = ss.trays[c * TRAYS_PER_COLUMN + r];
      if (t && t.widthIn > colWidth) colWidth = t.widthIn;
    }
    x += colWidth + TRAY_GUTTER_IN;
  }
  let y = 0;
  for (let r = 0; r < row; r++) {
    const t = ss.trays[col * TRAYS_PER_COLUMN + r];
    if (t) y += t.heightIn + TRAY_GUTTER_IN;
  }
  return { x, y };
}

/** Total bounds spanned by all trays under the column-major auto-flow. */
export function seedStartingWorldBounds(ss: SeedStartingState): { width: number; height: number } {
  if (ss.trays.length === 0) return { width: 0, height: 0 };
  const cols = Math.ceil(ss.trays.length / TRAYS_PER_COLUMN);
  let width = 0;
  let height = 0;
  for (let c = 0; c < cols; c++) {
    let colWidth = 0;
    let colHeight = 0;
    let rowsInCol = 0;
    for (let r = 0; r < TRAYS_PER_COLUMN; r++) {
      const t = ss.trays[c * TRAYS_PER_COLUMN + r];
      if (!t) break;
      if (t.widthIn > colWidth) colWidth = t.widthIn;
      colHeight += t.heightIn;
      rowsInCol += 1;
    }
    if (rowsInCol > 1) colHeight += (rowsInCol - 1) * TRAY_GUTTER_IN;
    width += colWidth;
    if (c < cols - 1) width += TRAY_GUTTER_IN;
    if (colHeight > height) height = colHeight;
  }
  return { width, height };
}

function findNode(id: string): SeedNode | undefined {
  const ss = useGardenStore.getState().garden.seedStarting;
  const t = ss.trays.find((x) => x.id === id);
  if (t) return { kind: 'tray', id: t.id, data: t };
  const s = ss.seedlings.find((x) => x.id === id);
  if (s) return { kind: 'seedling', id: s.id, data: s };
  return undefined;
}

function allNodes(): SeedNode[] {
  const ss = useGardenStore.getState().garden.seedStarting;
  const out: SeedNode[] = [];
  for (const t of ss.trays) out.push({ kind: 'tray', id: t.id, data: t });
  for (const s of ss.seedlings) out.push({ kind: 'seedling', id: s.id, data: s });
  return out;
}

function trayContains(tray: Tray, ss: SeedStartingState, worldX: number, worldY: number): boolean {
  const o = trayWorldOrigin(tray, ss);
  const lx = worldX - o.x;
  const ly = worldY - o.y;
  return lx >= 0 && ly >= 0 && lx < tray.widthIn && ly < tray.heightIn;
}

function findEmptyCellNearest(
  tray: Tray,
  localX: number,
  localY: number,
  excludeSeedlingId?: string,
): { row: number; col: number } | null {
  const direct = hitTestCellInches(tray, localX, localY);
  const isAvailable = (r: number, c: number) => {
    const slot = getCell(tray, r, c);
    if (!slot) return false;
    if (slot.state === 'empty') return true;
    return slot.seedlingId === excludeSeedlingId;
  };
  if (direct && isAvailable(direct.row, direct.col)) return direct;

  // Fall back to nearest available cell by squared distance to cursor.
  let best: { row: number; col: number; d: number } | null = null;
  for (let r = 0; r < tray.rows; r++) {
    for (let c = 0; c < tray.cols; c++) {
      if (!isAvailable(r, c)) continue;
      const center = cellCenterInches(tray, r, c);
      const dx = center.x - localX;
      const dy = center.y - localY;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { row: r, col: c, d };
    }
  }
  return best ? { row: best.row, col: best.col } : null;
}

export function createSeedStartingSceneAdapter(): SeedStartingSceneAdapter {
  const adapter: SeedStartingSceneAdapter = {
    getNode(id) {
      return findNode(id);
    },
    getNodes() {
      return allNodes();
    },
    getPose(id) {
      const node = findNode(id);
      if (!node) throw new Error(`seed-starting scene node not found: ${id}`);
      const ss = useGardenStore.getState().garden.seedStarting;
      switch (node.kind) {
        case 'tray':
          return trayWorldOrigin(node.data, ss);
        case 'seedling': {
          const s = node.data;
          if (!s.trayId || s.row == null || s.col == null) return { x: 0, y: 0 };
          const tray = ss.trays.find((t) => t.id === s.trayId);
          if (!tray) return { x: 0, y: 0 };
          const o = trayWorldOrigin(tray, ss);
          const c = cellCenterInches(tray, s.row, s.col);
          return { x: o.x + c.x, y: o.y + c.y };
        }
      }
    },
    getParent(id) {
      const node = findNode(id);
      if (!node) return null;
      switch (node.kind) {
        case 'tray':
          return null;
        case 'seedling':
          return node.data.trayId ?? null;
      }
    },
    getChildren(parentId) {
      const ss = useGardenStore.getState().garden.seedStarting;
      const out: string[] = [];
      for (const s of ss.seedlings) if (s.trayId === parentId) out.push(s.id);
      return out;
    },
    setPose(id, pose) {
      const node = findNode(id);
      if (!node) return;
      const store = useGardenStore.getState();
      switch (node.kind) {
        case 'tray':
          return;
        case 'seedling': {
          const s = node.data;
          const ss = store.garden.seedStarting;
          // Pick the target tray: prefer the one currently containing the cursor,
          // else fall back to the seedling's existing tray.
          let targetTray: Tray | null = null;
          for (const t of ss.trays) {
            if (trayContains(t, ss, pose.x, pose.y)) {
              targetTray = t;
              break;
            }
          }
          if (!targetTray && s.trayId) {
            targetTray = ss.trays.find((t) => t.id === s.trayId) ?? null;
          }
          if (!targetTray) return;
          const o = trayWorldOrigin(targetTray, ss);
          const target = findEmptyCellNearest(targetTray, pose.x - o.x, pose.y - o.y, s.id);
          if (!target) return;
          if (!s.trayId || s.row == null || s.col == null) return;
          if (s.trayId === targetTray.id && s.row === target.row && s.col === target.col) return;
          if (s.trayId === targetTray.id) {
            // Within-tray move uses the swap-aware path.
            store.moveSeedling(s.trayId, s.row, s.col, target.row, target.col);
          } else {
            // Cross-tray move: route through the batched action so it's a
            // single undo step. Note: the seed-starting flow does not
            // currently invoke setPose for cross-tray moves —
            // `useSeedlingMoveTool` calls the store action directly. This
            // branch keeps the adapter consistent if a future kit-driven
            // path lands.
            store.moveSeedlingsAcrossTrays([
              {
                seedlingId: s.id,
                fromTrayId: s.trayId,
                toTrayId: targetTray.id,
                toRow: target.row,
                toCol: target.col,
              },
            ]);
          }
          return;
        }
      }
    },
    setParent(_id, _parentId) {
      // No-op by design: cross-tray reparenting goes through
      // `gardenStore.moveSeedlingsAcrossTrays`, called directly by
      // `useSeedlingMoveTool.drag.onEnd` when a single-seedling drag commits
      // on a cell of a tray different from the source. The kit Tool gesture
      // engine never invokes this entrypoint for the seed-starting flow.
    },
    findSnapTarget(draggedId, worldX, worldY): SnapTarget<ScenePose> | null {
      const node = findNode(draggedId);
      if (!node || node.kind !== 'seedling') return null;
      const ss = useGardenStore.getState().garden.seedStarting;
      // Find the nearest tray (by center) that has an available cell near the cursor.
      let bestTray: Tray | null = null;
      let bestDist = Infinity;
      for (const t of ss.trays) {
        const o = trayWorldOrigin(t, ss);
        const cx = o.x + t.widthIn / 2;
        const cy = o.y + t.heightIn / 2;
        const d = (cx - worldX) ** 2 + (cy - worldY) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestTray = t;
        }
      }
      if (!bestTray) return null;
      const o = trayWorldOrigin(bestTray, ss);
      const cell = findEmptyCellNearest(bestTray, worldX - o.x, worldY - o.y, draggedId);
      if (!cell) return null;
      const center = cellCenterInches(bestTray, cell.row, cell.col);
      return {
        parentId: bestTray.id,
        slotPose: { x: o.x + center.x, y: o.y + center.y },
        metadata: { row: cell.row, col: cell.col },
      };
    },
    applyBatch(ops, label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
      void label;
    },
    hitTest(worldX, worldY) {
      return adapter.hitAll(worldX, worldY)[0] ?? null;
    },
    hitAll(worldX, worldY) {
      const ss = useGardenStore.getState().garden.seedStarting;
      const out: SeedNode[] = [];
      // Seedlings on top: hit-test by occupied cell.
      for (const tray of ss.trays) {
        const o = trayWorldOrigin(tray, ss);
        const cell = hitTestCellInches(tray, worldX - o.x, worldY - o.y);
        if (!cell) continue;
        const slot = getCell(tray, cell.row, cell.col);
        if (slot && slot.state === 'sown' && slot.seedlingId) {
          const s = ss.seedlings.find((x) => x.id === slot.seedlingId);
          if (s) out.push({ kind: 'seedling', id: s.id, data: s });
        }
      }
      // Trays below.
      for (const tray of ss.trays) {
        if (trayContains(tray, ss, worldX, worldY)) {
          out.push({ kind: 'tray', id: tray.id, data: tray });
        }
      }
      return out;
    },
    getSelection() {
      return useUiStore.getState().selectedIds;
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
  };
  return adapter;
}
