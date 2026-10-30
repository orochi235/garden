import { LayerPropertiesPanel } from './LayerPropertiesPanel';
import { PropertiesPanel } from './PropertiesPanel';
import styles from './Sidebar.module.css';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPropertiesPanel />
    </div>
  );
}
