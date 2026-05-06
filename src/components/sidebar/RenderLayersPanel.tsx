import { useMemo } from 'react';
import { useUiStore } from '../../store/uiStore';
import {
  useRegisteredLayers,
  type RegisteredLayer,
  type RegistryMode,
} from '../../canvas/layers/renderLayerRegistry';
import { STRUCTURE_LAYER_DESCRIPTORS } from '../../canvas/layers/structureLayersWorld';
import { ZONE_LAYER_DESCRIPTORS } from '../../canvas/layers/zoneLayersWorld';
import { PLANTING_LAYER_DESCRIPTORS } from '../../canvas/layers/plantingLayersWorld';
import { SELECTION_LAYER_DESCRIPTORS } from '../../canvas/layers/selectionLayersWorld';
import { SYSTEM_LAYER_DESCRIPTORS } from '../../canvas/layers/systemLayersWorld';
import type { LayerDescriptor } from '../../canvas/layers/worldLayerData';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { LayerSection } from './LayerSection';

/**
 * Each garden-mode group is defined by an explicit array of descriptors
 * imported from the corresponding `*LayersWorld.ts` factory. That array is
 * the single source of truth for `id`/`label`/`alwaysOn`/`defaultVisible`
 * — the factory uses it to build its `RenderLayer` objects, and we use it
 * here to decide group membership without prefix-matching ids.
 *
 * Anything registered at runtime that isn't in any descriptor group (debug
 * overlays, seed-starting mode layers, future ad-hoc layers) falls through
 * to a prefix-based fallback so it still shows up in the panel.
 */
const DESCRIPTOR_GROUPS: { name: string; descriptors: readonly LayerDescriptor[] }[] = [
  { name: 'Structures', descriptors: STRUCTURE_LAYER_DESCRIPTORS },
  { name: 'Zones', descriptors: ZONE_LAYER_DESCRIPTORS },
  { name: 'Plantings', descriptors: PLANTING_LAYER_DESCRIPTORS },
  { name: 'Selection', descriptors: SELECTION_LAYER_DESCRIPTORS },
  { name: 'System', descriptors: SYSTEM_LAYER_DESCRIPTORS },
];

const DESCRIPTOR_GROUP_IDS: Set<string> = new Set(
  DESCRIPTOR_GROUPS.flatMap((g) => g.descriptors.map((d) => d.id)),
);

/** Fallback prefix groups for layers not covered by descriptor arrays. */
const FALLBACK_GROUPS: { name: string; match: (id: string) => boolean }[] = [
  { name: 'Trays', match: (id) => id.startsWith('tray-') },
  { name: 'Seedlings', match: (id) => id.startsWith('seedling') },
  { name: 'Debug', match: (id) => id.startsWith('debug') },
];

function groupLayers(layers: RegisteredLayer[]): { name: string; layers: RegisteredLayer[] }[] {
  const byId = new Map(layers.map((l) => [l.id, l] as const));
  const out: { name: string; layers: RegisteredLayer[] }[] = [];

  // Descriptor-driven groups: only include if at least one of their
  // descriptors is actually registered for the current mode.
  for (const group of DESCRIPTOR_GROUPS) {
    const present: RegisteredLayer[] = [];
    for (const d of group.descriptors) {
      const live = byId.get(d.id);
      if (live) present.push(live);
    }
    if (present.length > 0) out.push({ name: group.name, layers: present });
  }

  // Fallback prefix groups for everything else.
  const remaining = layers.filter((l) => !DESCRIPTOR_GROUP_IDS.has(l.id));
  for (const fallback of FALLBACK_GROUPS) {
    const matched = remaining.filter((l) => fallback.match(l.id));
    if (matched.length > 0) out.push({ name: fallback.name, layers: matched });
  }

  const other = remaining.filter(
    (l) => !FALLBACK_GROUPS.some((f) => f.match(l.id)),
  );
  if (other.length > 0) out.push({ name: 'Other', layers: other });
  return out;
}

export function RenderLayersPanel() {
  const visibility = useUiStore((s) => s.renderLayerVisibility);
  const setVisible = useUiStore((s) => s.setRenderLayerVisible);
  const appMode = useUiStore((s) => s.appMode);
  const mode: RegistryMode = appMode === 'seed-starting' ? 'seed-starting' : 'garden';
  const layers = useRegisteredLayers(mode);
  const groups = useMemo(() => groupLayers(layers), [layers]);

  return (
    <LayerSection title="Render Layers" defaultOpen={false}>
      {groups.length === 0 && (
        <div className={styles.radioLegend} style={{ opacity: 0.6 }}>
          (no layers registered yet)
        </div>
      )}
      {groups.map((group) => (
        <div key={group.name}>
          <div className={styles.radioLegend}>{group.name}</div>
          {group.layers.map((layer) => {
            const isAlwaysOn = layer.alwaysOn;
            const defaultVis = layer.defaultVisible !== false;
            const checked = isAlwaysOn || (visibility[layer.id] ?? defaultVis);

            return (
              <label
                key={layer.id}
                className={styles.surfaceToggle}
                style={isAlwaysOn ? { opacity: 0.5 } : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isAlwaysOn}
                  onChange={(e) => setVisible(layer.id, e.target.checked)}
                />
                <span>{layer.label}</span>
              </label>
            );
          })}
        </div>
      ))}
    </LayerSection>
  );
}
