import type { LayerId } from '../../model/types';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPanel.module.css';
import { ToggleSwitch } from './ToggleSwitch';

const layers: { id: LayerId; label: string }[] = [
  { id: 'plantings', label: 'Plantings' },
  { id: 'zones', label: 'Zones' },
  { id: 'structures', label: 'Structures' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'ground', label: 'Ground' },
];

export function LayerPanel() {
  const activeLayer = useUiStore((s) => s.activeLayer);
  const visibility = useUiStore((s) => s.layerVisibility);
  const setActiveLayer = useUiStore((s) => s.setActiveLayer);
  const setLayerVisible = useUiStore((s) => s.setLayerVisible);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Layers</div>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`${styles.layer} ${activeLayer === layer.id ? styles.active : ''}`}
          onClick={() => setActiveLayer(layer.id, true)}
        >
          <ToggleSwitch
            checked={visibility[layer.id]}
            onChange={(v) => setLayerVisible(layer.id, v)}
            title={visibility[layer.id] ? 'Hide' : 'Show'}
          />
          <span>{layer.label}</span>
        </div>
      ))}
    </div>
  );
}
