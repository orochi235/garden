import { useMemo } from 'react';
import { useUiStore } from '../../store/uiStore';
import {
  useRegisteredLayers,
  type RegisteredLayer,
  type RegistryMode,
} from '../../canvas/layers/renderLayerRegistry';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { LayerSection } from './LayerSection';

/**
 * The panel groups layers by id-prefix so the list stays scannable as more
 * layers get added by the prototypes. Anything that doesn't match a known
 * prefix falls into 'Other' so it still shows up.
 */
const GROUPS: { name: string; match: (id: string) => boolean }[] = [
  { name: 'Structures', match: (id) => id.startsWith('structure-') },
  { name: 'Zones', match: (id) => id.startsWith('zone-') },
  { name: 'Plantings', match: (id) => id.startsWith('planting-') || id.startsWith('container-') },
  { name: 'Trays', match: (id) => id.startsWith('tray-') },
  { name: 'Seedlings', match: (id) => id.startsWith('seedling') },
  { name: 'Selection', match: (id) => id.startsWith('selection-') },
  { name: 'System', match: (id) => id.startsWith('system') },
  { name: 'Debug', match: (id) => id.startsWith('debug') },
];

function groupLayers(layers: RegisteredLayer[]): { name: string; layers: RegisteredLayer[] }[] {
  const buckets = GROUPS.map((g) => ({ name: g.name, layers: [] as RegisteredLayer[] }));
  const other: RegisteredLayer[] = [];
  for (const layer of layers) {
    const idx = GROUPS.findIndex((g) => g.match(layer.id));
    if (idx >= 0) buckets[idx].layers.push(layer);
    else other.push(layer);
  }
  if (other.length > 0) buckets.push({ name: 'Other', layers: other });
  return buckets.filter((b) => b.layers.length > 0);
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
