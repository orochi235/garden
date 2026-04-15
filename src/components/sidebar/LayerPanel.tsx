import { useUiStore } from '../../store/uiStore';
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
  const opacity = useUiStore((s) => s.layerOpacity);
  const locked = useUiStore((s) => s.layerLocked);
  const setActiveLayer = useUiStore((s) => s.setActiveLayer);
  const setLayerVisible = useUiStore((s) => s.setLayerVisible);
  const setLayerOpacity = useUiStore((s) => s.setLayerOpacity);
  const setLayerLocked = useUiStore((s) => s.setLayerLocked);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Layers</div>
      {layers.map((layer) => (
        <div key={layer.id} className={`${styles.layer} ${activeLayer === layer.id ? styles.active : ''}`} onClick={() => setActiveLayer(layer.id)}>
          <span>{layer.label}</span>
          <div className={styles.controls}>
            <input className={styles.opacitySlider} type="range" min="0" max="1" step="0.1"
              value={opacity[layer.id]} onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))} onClick={(e) => e.stopPropagation()} />
            <button className={styles.iconButton} title={visibility[layer.id] ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); setLayerVisible(layer.id, !visibility[layer.id]); }}>
              {visibility[layer.id] ? '👁' : '👁‍🗨'}
            </button>
            <button className={styles.iconButton} title={locked[layer.id] ? 'Unlock' : 'Lock'}
              onClick={(e) => { e.stopPropagation(); setLayerLocked(layer.id, !locked[layer.id]); }}>
              {locked[layer.id] ? '🔒' : '🔓'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
