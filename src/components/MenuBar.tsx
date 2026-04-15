import { useMemo } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { downloadGarden, openGardenFile } from '../utils/file';
import { getCurrentTheme } from '../utils/timeTheme';
import styles from '../styles/MenuBar.module.css';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const theme = useMemo(() => getCurrentTheme(), []);

  async function handleOpen() {
    try { const loaded = await openGardenFile(); loadGarden(loaded); } catch {}
  }
  function handleSave() { downloadGarden(garden); }
  function handleNew() { reset(); }

  return (
    <div className={styles.menuBar} style={{ background: theme.menuBarBg, color: theme.menuBarText }}>
      <div className={styles.title} style={{ color: theme.menuBarTitle }}>Garden Planner</div>
      <div className={styles.menus}>
        <span onClick={handleNew}>New</span>
        <span onClick={handleOpen}>Open</span>
        <span onClick={handleSave}>Save</span>
      </div>
    </div>
  );
}
