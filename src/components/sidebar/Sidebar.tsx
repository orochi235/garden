import { PropertiesPanel } from './PropertiesPanel';
import { LayerPropertiesPanel } from './LayerPropertiesPanel';
import styles from '../../styles/Sidebar.module.css';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPropertiesPanel />
    </div>
  );
}
