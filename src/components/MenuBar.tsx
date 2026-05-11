import { useEffect, useRef, useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/MenuBar.module.css';
import { downloadGarden, openGardenFile } from '../utils/file';
import { enterNursery } from '../utils/enterNursery';
import { CollectionEditor } from './collection/CollectionEditor';
import { CustomTrayBuilder } from './CustomTrayBuilder';
import { ModeOnly } from './ModeOnly';
import { TraySwitcher } from './TraySwitcher';

export function MenuBar() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const reset = useGardenStore((s) => s.reset);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const devRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!devOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!devRef.current?.contains(e.target as Node)) setDevOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDevOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [devOpen]);
  const collectionEditorOpen = useUiStore((s) => s.collectionEditorOpen);
  const setCollectionEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const setScheduleOpen = useUiStore((s) => s.setScheduleOpen);
  const setPlantsModalOpen = useUiStore((s) => s.setPlantsModalOpen);
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);

  function toggleNursery() {
    if (appMode === 'nursery') setAppMode('garden');
    else enterNursery();
  }

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
      <div className={styles.menus}>
        <button
          type="button"
          onClick={toggleNursery}
          aria-label="Nursery mode"
          aria-pressed={appMode === 'nursery'}
          title="Nursery mode"
          className={`${styles.iconButton} ${appMode === 'nursery' ? styles.iconButtonActive : ''}`}
        >🌱</button>
        <button type="button" onClick={() => setCollectionEditorOpen(true)} aria-label="Cultivar collection" title="Cultivar collection" className={styles.iconButton}>📦</button>
        <button type="button" onClick={() => setScheduleOpen(true)} aria-label="Schedule" title="Schedule" className={styles.iconButton}>📅</button>
        <button type="button" onClick={() => setPlantsModalOpen(true)} aria-label="Plant list" title="Plant list" className={styles.iconButton}>🔍</button>
      </div>
      <div className={styles.spacer} />
      <ModeOnly mode="nursery">
        <TraySwitcher onOpenCustomBuilder={() => setBuilderOpen(true)} />
      </ModeOnly>
      {builderOpen && <CustomTrayBuilder onClose={() => setBuilderOpen(false)} />}
      {collectionEditorOpen && <CollectionEditor />}
      {/* Dev fixtures menu hidden — top bar was too crowded. Reachable
          via the URL `?fixture=<name>` until we move it into the dev menu. */}
      <div className={styles.spacer} />
      <div ref={devRef} className={styles.devDropdown}>
        <button
          type="button"
          className={styles.devTrigger}
          aria-haspopup="menu"
          aria-expanded={devOpen}
          onClick={() => setDevOpen((v) => !v)}
        >
          <span className={styles.devLabel}>dev</span> <span aria-hidden>▾</span>
        </button>
        {devOpen && (
          <div className={styles.devMenu} role="menu">
            <a href="docs/patterns.html" target="_blank" rel="noreferrer" role="menuitem">Patterns</a>
            <a href="docs/cultivars.html" target="_blank" rel="noreferrer" role="menuitem">Flora</a>
            <a href="docs/themes.html" target="_blank" rel="noreferrer" role="menuitem">Themes</a>
            <a href="drag-lab.html" target="_blank" rel="noreferrer" role="menuitem">Layouts</a>
          </div>
        )}
      </div>
      <div className={styles.menus}>
        <button type="button" onClick={handleNew} className={styles.actionButton}>New</button>
        <button type="button" onClick={handleOpen} className={styles.actionButton}>Load</button>
        <button type="button" onClick={handleSave} className={`${styles.actionButton} ${styles.boldButton}`}>Save</button>
      </div>
    </div>
  );
}
