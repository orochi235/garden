import { useUiStore } from '../../store/uiStore';
import { ToggleSwitch } from './ToggleSwitch';
import type { LayerId } from '../../model/types';
import styles from '../../styles/LayerPanel.module.css';

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
        <div key={layer.id} className={`${styles.layer} ${activeLayer === layer.id ? styles.active : ''}`} onClick={() => setActiveLayer(layer.id)}>
          <ToggleSwitch checked={visibility[layer.id]} onChange={(v) => setLayerVisible(layer.id, v)} title={visibility[layer.id] ? 'Hide' : 'Show'} />
          <span>{layer.label}</span>
        </div>
      ))}
    </div>
  );
}
