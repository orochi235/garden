import { useActiveTheme } from '../hooks/useActiveTheme';
import { useGardenStore } from '../store/gardenStore';
import styles from '../styles/MenuBar.module.css';
import { downloadGarden, openGardenFile } from '../utils/file';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const { theme, transitionDuration: dur } = useActiveTheme();

  async function handleOpen() {
    try {
      const loaded = await openGardenFile();
      loadGarden(loaded);
    } catch {}
  }
  function handleSave() {
    downloadGarden(garden);
  }
  function handleNew() {
    reset();
  }

  return (
    <div
      className={styles.menuBar}
      style={{ color: theme.menuBarText, transition: `color ${dur} ease` }}
    >
      <div
        className={styles.title}
        style={{ color: theme.menuBarTitle, transition: `color ${dur} ease` }}
      >
        Garden Planner
      </div>
      <div className={styles.menus}>
        <span onClick={handleNew}>New</span>
        <span onClick={handleOpen}>Open</span>
        <span
          onClick={handleSave}
          className={styles.saveButton}
          style={{ background: theme.listHover }}
        >Save</span>
      </div>
    </div>
  );
}
