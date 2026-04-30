import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import styles from '../styles/MenuBar.module.css';
import { downloadGarden, openGardenFile } from '../utils/file';
import { CustomTrayBuilder } from './CustomTrayBuilder';
import { ModeOnly } from './ModeOnly';
import { ModeSwitcher } from './ModeSwitcher';
import { TraySwitcher } from './TraySwitcher';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const [builderOpen, setBuilderOpen] = useState(false);

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
    <div className={styles.menuBar}>
      <div className={styles.title}>Garden Planner</div>
      <ModeSwitcher />
      <ModeOnly mode="seed-starting">
        <TraySwitcher onOpenCustomBuilder={() => setBuilderOpen(true)} />
      </ModeOnly>
      {builderOpen && <CustomTrayBuilder onClose={() => setBuilderOpen(false)} />}
      <div className={styles.spacer} />
      <div className={styles.devNav}>
        <span className={styles.devLabel}>dev</span>
        <a href="docs/patterns.html" target="_blank" rel="noreferrer">Patterns</a>
        <a href="docs/cultivars.html" target="_blank" rel="noreferrer">Flora</a>
        <a href="docs/themes.html" target="_blank" rel="noreferrer">Themes</a>
        <a href="drag-lab.html" target="_blank" rel="noreferrer">Layouts</a>
      </div>
      <div className={styles.menus}>
        <span onClick={handleNew}>New</span>
        <span onClick={handleOpen}>Open</span>
        <span
          onClick={handleSave}
          className={styles.saveButton}
          style={{ background: 'var(--theme-list-hover)' }}
        >Save</span>
      </div>
    </div>
  );
}
