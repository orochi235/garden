import { useEffect, useMemo, useState } from 'react';
import { findInUseRemovals } from '../../model/collection';
import { getAllCultivars } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/CollectionEditor.module.css';
import { useCollectionEditorState } from '../../hooks/useCollectionEditorState';
import { CollectionPane } from './CollectionPane';
import { TransferControls } from './TransferControls';

export function CollectionEditor() {
  const garden = useGardenStore((s) => s.garden);
  const setCollection = useGardenStore((s) => s.setCollection);
  const setOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const database = useMemo(() => getAllCultivars(), []);
  const state = useCollectionEditorState(garden.collection, database);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [warnRemovals, setWarnRemovals] = useState<string[] | null>(null);

  const pendingIds = useMemo(() => new Set(state.pending.map((c) => c.id)), [state.pending]);
  const leftSource = useMemo(
    () => database.filter((c) => !pendingIds.has(c.id)),
    [database, pendingIds],
  );
  const rightSource = state.pending;

  function close() {
    setOpen(false);
  }

  function attemptCancel() {
    if (state.dirty) setConfirmDiscard(true);
    else close();
  }

  function performCancel() {
    state.cancel();
    setConfirmDiscard(false);
    close();
  }

  function attemptSave() {
    const removed = state.computeRemovedIds();
    const inUse = findInUseRemovals(removed, garden.plantings, garden.seedStarting.seedlings);
    if (inUse.length > 0) {
      setWarnRemovals(inUse);
      return;
    }
    performSave();
  }

  function performSave() {
    setCollection(state.pending);
    setWarnRemovals(null);
    close();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (warnRemovals) setWarnRemovals(null);
        else if (confirmDiscard) setConfirmDiscard(false);
        else attemptCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warnRemovals, confirmDiscard, state.dirty]);

  function dragStart(side: 'left' | 'right', id: string, e: React.DragEvent) {
    e.dataTransfer.setData('application/x-cultivar-id-from-other', id);
    e.dataTransfer.setData('application/x-cultivar-source-side', side);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>Collection</div>
        <div className={styles.body}>
          <CollectionPane
            side="left"
            title="Available"
            source={leftSource}
            visibleCultivars={state.visibleCultivars('left', leftSource)}
            search={state.searchOf('left')}
            onSearchChange={(v) => state.setSearch('left', v)}
            categories={state.categoriesOf('left')}
            onCategoriesChange={(next) => state.setCategories('left', next)}
            expandedSpecies={state.expandedSpecies('left')}
            onSpeciesExpandToggle={(id) => state.toggleSpeciesExpand('left', id)}
            isChecked={(id) => state.leftChecked.has(id)}
            onCultivarToggle={(id) => state.toggleSelection('left', id)}
            speciesTriState={(sid, kids) => state.speciesSelectionState('left', sid, kids)}
            onSpeciesToggle={(sid, kids) => state.toggleSpeciesSelection('left', sid, kids)}
            onCultivarDragStart={(id, e) => dragStart('left', id, e)}
            onCultivarDragEnd={() => {}}
            onDropFromOther={(id) => state.dragTransfer('right', id)}
          />
          <TransferControls
            canTransferRight={state.leftChecked.size > 0}
            canTransferLeft={state.rightChecked.size > 0}
            onTransferRight={() => state.transferRight()}
            onTransferLeft={() => state.transferLeft()}
          />
          <CollectionPane
            side="right"
            title="In Collection"
            source={rightSource}
            visibleCultivars={state.visibleCultivars('right', rightSource)}
            search={state.searchOf('right')}
            onSearchChange={(v) => state.setSearch('right', v)}
            categories={state.categoriesOf('right')}
            onCategoriesChange={(next) => state.setCategories('right', next)}
            expandedSpecies={state.expandedSpecies('right')}
            onSpeciesExpandToggle={(id) => state.toggleSpeciesExpand('right', id)}
            isChecked={(id) => state.rightChecked.has(id)}
            onCultivarToggle={(id) => state.toggleSelection('right', id)}
            speciesTriState={(sid, kids) => state.speciesSelectionState('right', sid, kids)}
            onSpeciesToggle={(sid, kids) => state.toggleSpeciesSelection('right', sid, kids)}
            onCultivarDragStart={(id, e) => dragStart('right', id, e)}
            onCultivarDragEnd={() => {}}
            onDropFromOther={(id) => state.dragTransfer('left', id)}
          />
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.button} onClick={attemptCancel}>Cancel</button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={attemptSave}
            disabled={!state.dirty}
          >Save</button>
        </div>
      </div>

      {confirmDiscard && (
        <div className={styles.backdrop} style={{ zIndex: 1100 }}>
          <div className={styles.confirmDialog}>
            <p>Discard changes?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.button} onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={performCancel}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {warnRemovals && (
        <div className={styles.backdrop} style={{ zIndex: 1100 }}>
          <div className={styles.confirmDialog}>
            <p>{warnRemovals.length} cultivar{warnRemovals.length === 1 ? '' : 's'} in your garden will no longer appear in palettes:</p>
            <ul>
              {warnRemovals.map((id) => {
                const c = garden.collection.find((cc) => cc.id === id) ?? database.find((cc) => cc.id === id);
                return <li key={id}>{c?.name ?? id}</li>;
              })}
            </ul>
            <p>Existing plantings will remain.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.button} onClick={() => setWarnRemovals(null)}>Cancel</button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={performSave}>Save anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
