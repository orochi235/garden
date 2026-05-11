import { useUiStore } from '../../store/uiStore';
import { useRegisteredLayers, type RegistryMode } from '../../canvas/layers/renderLayerRegistry';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { LayerSection } from './LayerSection';

/**
 * Lists every render layer the canvas is currently drawing, in draw order.
 *
 * The canvas (`CanvasNewPrototype` / `NurseryCanvas`) calls
 * `setRegisteredLayers(mode, layers)` with whatever it passes to weasel, so
 * this panel mirrors weasel's actual render stack — no hardcoded list to
 * keep in sync.
 *
 * Per layer: a checkbox bound to `useUiStore.renderLayerVisibility[id]`.
 * `alwaysOn` layers render checked-and-disabled (weasel ignores the
 * visibility flag for them). `defaultVisible` (default `true`) decides the
 * initial state when no override exists.
 */
export function RenderLayersPanel() {
  const visibility = useUiStore((s) => s.renderLayerVisibility);
  const setVisible = useUiStore((s) => s.setRenderLayerVisible);
  const appMode = useUiStore((s) => s.appMode);
  const mode: RegistryMode = appMode === 'nursery' ? 'nursery' : 'garden';
  const layers = useRegisteredLayers(mode);

  return (
    <LayerSection title="Render Layers" defaultOpen={false}>
      {layers.length === 0 && (
        <div className={styles.radioLegend} style={{ opacity: 0.6 }}>
          (no layers registered yet)
        </div>
      )}
      {layers.map((layer) => {
        const isAlwaysOn = layer.alwaysOn === true;
        const defaultVis = layer.defaultVisible !== false;
        const checked = isAlwaysOn || (visibility[layer.id] ?? defaultVis);
        return (
          <label
            key={layer.id}
            className={styles.surfaceToggle}
            style={isAlwaysOn ? { opacity: 0.5 } : undefined}
            title={isAlwaysOn ? 'Always on (cannot be hidden)' : undefined}
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
    </LayerSection>
  );
}
