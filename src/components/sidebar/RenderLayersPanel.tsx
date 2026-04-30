import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { LayerSection } from './LayerSection';
import type { RenderLayer } from '@/canvas-kit';
import { ZONE_LAYERS } from '../../canvas/layers/zoneLayers';
import { STRUCTURE_LAYERS } from '../../canvas/layers/structureLayers';
import { PLANTING_LAYERS } from '../../canvas/layers/plantingLayers';
import { SELECTION_LAYERS } from '../../canvas/layers/selectionLayers';

interface LayerGroup {
  name: string;
  layers: RenderLayer<unknown>[];
}

const GROUPS: LayerGroup[] = [
  { name: 'Structures', layers: STRUCTURE_LAYERS as RenderLayer<unknown>[] },
  { name: 'Zones', layers: ZONE_LAYERS as RenderLayer<unknown>[] },
  { name: 'Plantings', layers: PLANTING_LAYERS as RenderLayer<unknown>[] },
  { name: 'System', layers: SELECTION_LAYERS as RenderLayer<unknown>[] },
];

// Also include the footprint circles pseudo-layer
const FOOTPRINT_CIRCLES_ID = 'planting-footprint-circles';

const SEED_STARTING_LAYERS: { id: string; label: string; defaultVisible: boolean }[] = [
  { id: 'tray-grid', label: 'Cell snap points', defaultVisible: true },
  { id: 'seedling-labels', label: 'Seedling labels', defaultVisible: false },
];

export function RenderLayersPanel() {
  const visibility = useUiStore((s) => s.renderLayerVisibility);
  const setVisible = useUiStore((s) => s.setRenderLayerVisible);
  const appMode = useUiStore((s) => s.appMode);

  if (appMode === 'seed-starting') {
    return (
      <LayerSection title="Render Layers" defaultOpen={false}>
        {SEED_STARTING_LAYERS.map((layer) => (
          <label key={layer.id} className={styles.surfaceToggle}>
            <input
              type="checkbox"
              checked={visibility[layer.id] ?? layer.defaultVisible}
              onChange={(e) => setVisible(layer.id, e.target.checked)}
            />
            <span>{layer.label}</span>
          </label>
        ))}
      </LayerSection>
    );
  }

  return (
    <LayerSection title="Render Layers" defaultOpen={false}>
      {GROUPS.map((group) => (
        <div key={group.name}>
          <div className={styles.radioLegend}>{group.name}</div>
          {group.layers.map((layer) => {
            const isAlwaysOn = layer.alwaysOn;
            const defaultVis = layer.defaultVisible !== false;
            const checked = isAlwaysOn || (visibility[layer.id] ?? defaultVis);

            return (
              <label key={layer.id} className={styles.surfaceToggle} style={isAlwaysOn ? { opacity: 0.5 } : undefined}>
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
          {group.name === 'Plantings' && (
            <label className={styles.surfaceToggle}>
              <input
                type="checkbox"
                checked={visibility[FOOTPRINT_CIRCLES_ID] ?? true}
                onChange={(e) => setVisible(FOOTPRINT_CIRCLES_ID, e.target.checked)}
              />
              <span>Footprint Circles</span>
            </label>
          )}
        </div>
      ))}
    </LayerSection>
  );
}
