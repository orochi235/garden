import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  createPlanting,
  createStructure,
  createZone,
} from '../../model/types';
import type { Planting, Structure, Zone } from '../../model/types';
import type { ClipboardSnapshot, InsertAdapter, Op } from '@/canvas-kit';

type GardenObj = Structure | Zone | Planting;

interface SnapshotItem {
  kind: 'structure' | 'zone' | 'planting';
  data: Structure | Zone | Planting;
}

export interface GardenInsertAdapter extends InsertAdapter<GardenObj> {
  removeObject(id: string): void;
}

export function createInsertAdapter(): GardenInsertAdapter {
  const adapter: GardenInsertAdapter = {
    commitInsert(b) {
      const tool = useUiStore.getState().plottingTool;
      if (!tool) return null;
      if (tool.category === 'structures') {
        return createStructure({
          type: tool.type,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      }
      if (tool.category === 'zones') {
        return createZone({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: tool.color,
          pattern: tool.pattern ?? null,
        });
      }
      return null;
    },
    snapshotSelection(ids) {
      const { garden } = useGardenStore.getState();
      const idSet = new Set(ids);
      const items: SnapshotItem[] = [];
      for (const s of garden.structures) {
        if (idSet.has(s.id)) items.push({ kind: 'structure', data: s });
      }
      for (const z of garden.zones) {
        if (idSet.has(z.id)) items.push({ kind: 'zone', data: z });
      }
      for (const p of garden.plantings) {
        if (idSet.has(p.id)) items.push({ kind: 'planting', data: p });
      }
      return { items };
    },
    commitPaste(clipboard: ClipboardSnapshot, offset) {
      const out: GardenObj[] = [];
      for (const raw of clipboard.items) {
        const item = raw as SnapshotItem;
        if (item.kind === 'structure') {
          const s = item.data as Structure;
          out.push(
            createStructure({
              type: s.type,
              x: s.x + offset.dx,
              y: s.y + offset.dy,
              width: s.width,
              height: s.height,
              shape: s.shape,
              groupId: s.groupId ?? undefined,
            }),
          );
        } else if (item.kind === 'zone') {
          const z = item.data as Zone;
          out.push(
            createZone({
              x: z.x + offset.dx,
              y: z.y + offset.dy,
              width: z.width,
              height: z.height,
              color: z.color,
              pattern: z.pattern,
            }),
          );
        } else {
          const p = item.data as Planting;
          // Plantings are parent-relative; the offset doesn't apply to their
          // local x/y. They keep the same parentId — selection-paste-of-planting
          // creates a sibling under the same parent.
          out.push(
            createPlanting({
              parentId: p.parentId,
              x: p.x,
              y: p.y,
              cultivarId: p.cultivarId,
            }),
          );
        }
      }
      return out;
    },
    getPasteOffset(_clipboard) {
      const cell = useGardenStore.getState().garden.gridCellSizeFt;
      return { dx: cell, dy: cell };
    },
    insertObject(obj) {
      if ('cultivarId' in obj) {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, plantings: [...s.garden.plantings, obj as Planting] },
        }));
      } else if ('type' in obj) {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, structures: [...s.garden.structures, obj as Structure] },
        }));
      } else {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, zones: [...s.garden.zones, obj as Zone] },
        }));
      }
    },
    removeObject(id) {
      useGardenStore.setState((s) => ({
        garden: {
          ...s.garden,
          structures: s.garden.structures.filter((x) => x.id !== id),
          zones: s.garden.zones.filter((x) => x.id !== id),
          plantings: s.garden.plantings.filter((x) => x.id !== id),
        },
      }));
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
    applyBatch(ops: Op[], _label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter as never);
    },
  };
  return adapter;
}
