import { useGardenStore } from '../store/gardenStore';
import { downloadGarden, openGardenFile } from '../utils/file';
import { useActiveTheme } from '../hooks/useActiveTheme';
import styles from '../styles/MenuBar.module.css';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const { theme, transitionDuration: dur } = useActiveTheme();

  async function handleOpen() {
    try { const loaded = await openGardenFile(); loadGarden(loaded); } catch {}
  }
  function handleSave() { downloadGarden(garden); }
  function handleNew() { reset(); }

  return (
    <div className={styles.menuBar} style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}>
      <div className={styles.title} style={{ color: theme.menuBarTitle, transition: `color ${dur} ease` }}>Garden Planner</div>
      <div className={styles.menus}>
        <span onClick={handleNew}>New</span>
        <span onClick={handleOpen}>Open</span>
        <span onClick={handleSave}>Save</span>
      </div>
    </div>
  );
}
