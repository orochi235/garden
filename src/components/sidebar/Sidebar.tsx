import { PropertiesPanel } from './PropertiesPanel';
import { LayerPanel } from './LayerPanel';
import styles from '../../styles/Sidebar.module.css';

export function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <PropertiesPanel />
      <div className={styles.divider} />
      <LayerPanel />
    </div>
  );
}
