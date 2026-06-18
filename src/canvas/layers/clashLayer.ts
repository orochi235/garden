import type { Dims, RenderLayer, View } from '@orochi235/weasel';
import { rectPath } from '@orochi235/weasel';
import type { Structure } from '../../model/types';
import { type DrawCommand, ellipsePolygon, viewToMat3 } from '../util/weaselLocal';
import type { GetUi } from './worldLayerData';

/**
 * Structure-clash highlight. `detectStructureClash` (a move behavior) publishes
 * the ids of non-dragging structures whose AABB intersects the dragging set into
 * `uiStore.dragClashIds`; this layer paints a red-tinted ring on each so the
 * user sees the collision warning during a drag.
 *
 * Re-homed (Phase 7 step 3) from the deleted `structure-highlights` layer when
 * eric's body rendering moved to the kit scene slot. World-coordinate paths
 * wrapped in `viewToMat3(view)` under a `space: 'screen'` layer (matching the
 * other eric decoration layers — see `createGroupOutlineLayer`).
 */
export function createStructureClashLayer(
  getStructures: () => Structure[],
  getUi: GetUi,
): RenderLayer<unknown> {
  return {
    id: 'structure-clash',
    label: 'Structure Clash',
    alwaysOn: true,
    space: 'screen' as const,
    draw(_data: unknown, view: View, _dims: Dims): DrawCommand[] {
      const clashIds = getUi().dragClashIds ?? [];
      if (clashIds.length === 0) return [];
      const byId = new Map(getStructures().map((s) => [s.id, s] as const));
      const lw = 2 / Math.max(0.0001, view.scale.x);

      const clashChildren: DrawCommand[] = [];
      for (const id of clashIds) {
        const s = byId.get(id);
        if (!s) continue;
        const path =
          s.shape === 'circle'
            ? ellipsePolygon(s.x + s.width / 2, s.y + s.length / 2, s.width / 2, s.length / 2)
            : rectPath(s.x, s.y, s.width, s.length);
        clashChildren.push({
          kind: 'path',
          path,
          fill: { fill: 'solid', color: 'rgba(224, 65, 58, 0.15)' },
          stroke: { paint: { fill: 'solid', color: '#E0413A' }, width: lw },
        });
      }
      if (clashChildren.length === 0) return [];
      return [
        {
          kind: 'group',
          transform: viewToMat3(view),
          children: [{ kind: 'group', alpha: 0.85, children: clashChildren }],
        },
      ];
    },
  };
}
