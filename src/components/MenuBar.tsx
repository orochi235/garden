import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/MenuBar.module.css';
import { deserializeGarden, downloadGarden, openGardenFile } from '../utils/file';

const FIXTURES = [
  { label: 'Marinara', path: 'marinara.garden' },
  { label: '8 Tomatoes', path: 'eight-tomatoes.garden' },
  { label: 'Salsa', path: 'salsa.garden' },
  { label: 'Trellis', path: 'trellis-bed.garden' },
];
import { CollectionEditor } from './collection/CollectionEditor';
import { CustomTrayBuilder } from './CustomTrayBuilder';
import { ModeOnly } from './ModeOnly';
import { ModeSwitcher } from './ModeSwitcher';
import { TraySwitcher } from './TraySwitcher';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const [builderOpen, setBuilderOpen] = useState(false);
  const collectionEditorOpen = useUiStore((s) => s.collectionEditorOpen);
  const setCollectionEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const setScheduleOpen = useUiStore((s) => s.setScheduleOpen);

  async function handleOpen() {
    try {
      const loaded = await openGardenFile();
      const current = garden.collection ?? [];
      const incoming = loaded.collection ?? [];
      if (current.length > 0 && incoming.length !== current.length) {
        const keep = window.confirm(
          `Keep your current collection (${current.length} cultivars)? OK = keep current, Cancel = use the file's collection (${incoming.length}).`,
        );
        if (keep) loaded.collection = current;
      }
      loadGarden(loaded);
    } catch {}
  }
  function handleSave() {
    downloadGarden(garden);
  }
  function handleNew() {
    const current = garden.collection ?? [];
    if (current.length > 0) {
      const keep = window.confirm(
        `Keep your current collection (${current.length} cultivars) in the new garden?`,
      );
      reset();
      if (keep) useGardenStore.getState().setCollection(current);
    } else {
      reset();
    }
  }

  return (
    <div className={styles.menuBar}>
      <div className={styles.title}>Garden Planner</div>
      <ModeSwitcher />
      <ModeOnly mode="seed-starting">
        <TraySwitcher onOpenCustomBuilder={() => setBuilderOpen(true)} />
      </ModeOnly>
      {builderOpen && <CustomTrayBuilder onClose={() => setBuilderOpen(false)} />}
      {collectionEditorOpen && <CollectionEditor />}
      <div className={styles.devNav}>
        <span className={styles.devLabel}>fixtures</span>
        {FIXTURES.map((f) => (
          <span
            key={f.path}
            style={{ cursor: 'pointer' }}
            onClick={async () => {
              try {
                const text = await fetch(f.path).then((r) => r.text());
                loadGarden(deserializeGarden(text));
              } catch (e) {
                console.error('failed to load fixture', f.path, e);
              }
            }}
          >
            {f.label}
          </span>
        ))}
      </div>
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
        <span onClick={() => setCollectionEditorOpen(true)}>Collection…</span>
        <span onClick={() => setScheduleOpen(true)}>Schedule…</span>
        <span
          onClick={handleSave}
          className={styles.saveButton}
          style={{ background: 'var(--theme-list-hover)' }}
        >Save</span>
      </div>
    </div>
  );
}
