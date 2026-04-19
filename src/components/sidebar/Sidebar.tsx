import styles from '../../styles/Sidebar.module.css';
import { LayerPropertiesPanel } from './LayerPropertiesPanel';
import { PropertiesPanel } from './PropertiesPanel';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPropertiesPanel />
    </div>
  );
}
