import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { CanvasStack } from '../canvas/CanvasStack';
import styles from '../styles/App.module.css';

export function App() {
  return (
    <div className={styles.layout}>
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>Palette</div>
      <div className={styles.canvas}>
        <CanvasStack />
      </div>
      <div className={styles.sidebar}>Sidebar</div>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
