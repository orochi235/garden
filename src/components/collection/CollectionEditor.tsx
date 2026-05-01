import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { findInUseRemovals } from '../../model/collection';
import { getAllCultivars, type CultivarCategory } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/CollectionEditor.module.css';
import { useCollectionEditorState } from '../../hooks/useCollectionEditorState';
import type { DragPayload } from '@orochi235/weasel';
import { CultivarDataGrid } from './CultivarDataGrid';
import { CultivarIconView } from './CultivarIconView';
import { CollectionList } from './CollectionList';

type ViewMode = 'list' | 'icons';

const CATEGORY_LABELS: Record<CultivarCategory, string> = {
  vegetables: 'Vegetables',
  greens: 'Greens',
  fruits: 'Fruits',
  squash: 'Squash',
  'root-vegetables': 'Roots',
  legumes: 'Legumes',
  herbs: 'Herbs',
  flowers: 'Flowers',
};
const CATEGORY_ORDER: CultivarCategory[] = [
  'vegetables', 'greens', 'fruits', 'squash', 'root-vegetables', 'legumes', 'herbs', 'flowers',
];

export function CollectionEditor() {
  const garden = useGardenStore((s) => s.garden);
  const setCollection = useGardenStore((s) => s.setCollection);
  const setOpen = useUiStore((s) => s.setCollectionEditorOpen);
  const database = useMemo(() => getAllCultivars().filter((c) => c.variety != null), []);
  const state = useCollectionEditorState(garden.collection, database);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [warnRemovals, setWarnRemovals] = useState<string[] | null>(null);
  const [confirmAddSelected, setConfirmAddSelected] = useState(false);
  const [pendingSaveAfterTransfer, setPendingSaveAfterTransfer] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('icons');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && e.shiftKey && state.checked.size > 0) {
        e.preventDefault();
        state.transferRight();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const pendingIds = useMemo(() => new Set(state.pending.map((c) => c.id)), [state.pending]);
  const leftSource = useMemo(
    () => database.filter((c) => !pendingIds.has(c.id)),
    [database, pendingIds],
  );
  const visible = useMemo(() => state.visibleCultivars(leftSource), [state, leftSource]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of leftSource) counts[c.category] = (counts[c.category] ?? 0) + 1;
    return counts;
  }, [leftSource]);

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
    if (state.checked.size > 0) {
      setConfirmAddSelected(true);
      return;
    }
    runSaveChecks();
  }

  function runSaveChecks() {
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
    if (pendingSaveAfterTransfer && state.checked.size === 0) {
      setPendingSaveAfterTransfer(false);
      runSaveChecks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSaveAfterTransfer, state.checked.size]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (warnRemovals) setWarnRemovals(null);
        else if (confirmAddSelected) setConfirmAddSelected(false);
        else if (confirmDiscard) setConfirmDiscard(false);
        else attemptCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warnRemovals, confirmDiscard, confirmAddSelected, state.dirty]);

  function getDragPayload(id: string): DragPayload {
    const ids = Array.from(new Set([id, ...state.checked]));
    if (!state.checked.has(id)) state.toggleChecked(id);
    return { kind: 'cultivar', ids };
  }

  function toggleCategory(cat: CultivarCategory) {
    const next = new Set(state.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    state.setCategories(next);
  }

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>Collection</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={attemptCancel}
            aria-label="Close"
            title="Close"
          >×</button>
        </div>
        <div className={styles.body}>
          <div className={styles.left}>
            <div className={styles.paneTitle}>
              <span>Available</span>
              <button
                type="button"
                className={styles.transferButton}
                onClick={() => state.transferRight()}
                disabled={state.checked.size === 0}
                title="Add selected to collection"
              >Add {state.checked.size > 0 ? `(${state.checked.size})` : ''} ›</button>
            </div>
            <div className={styles.search}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search…"
                value={state.search}
                onChange={(e) => state.setSearch(e.target.value)}
              />
            </div>
            <div className={styles.chips}>
              {CATEGORY_ORDER.map((cat) => (
                <span
                  key={cat}
                  className={`${styles.chip} ${state.categories.has(cat) ? styles.chipActive : ''}`}
                  onClick={() => toggleCategory(cat)}
                >
                  {CATEGORY_LABELS[cat]} <span className={styles.chipCount}>{categoryCounts[cat] ?? 0}</span>
                </span>
              ))}
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                >☰</button>
                <button
                  type="button"
                  className={`${styles.viewToggleButton} ${viewMode === 'icons' ? styles.viewToggleActive : ''}`}
                  onClick={() => setViewMode('icons')}
                  title="Icon view"
                >▦</button>
              </div>
            </div>
            {viewMode === 'icons' ? (
              <div className={styles.gridWrap}>
                <CultivarIconView
                  visibleCultivars={visible}
                  isChecked={(id) => state.checked.has(id)}
                  onCultivarToggle={state.toggleChecked}
                  onCultivarAdd={state.addOne}
                  getDragPayload={getDragPayload}
                />
              </div>
            ) : (
            <CultivarDataGrid
              visibleCultivars={visible}
              expandedSpecies={state.expandedSpecies}
              onSpeciesExpandToggle={state.toggleSpeciesExpand}
              isChecked={(id) => state.checked.has(id)}
              onCultivarToggle={state.toggleChecked}
              speciesTriState={state.speciesSelectionState}
              onSpeciesToggle={state.toggleSpeciesSelection}
              sortColumn={state.sortColumn}
              sortDir={state.sortDir}
              onSortChange={state.setSort}
              getDragPayload={getDragPayload}
            />
            )}
          </div>
          <div className={styles.right}>
            <div className={styles.paneTitle}>
              <span>In Collection ({state.pending.length})</span>
            </div>
            <CollectionList
              collection={state.pending}
              onRemove={state.removeOne}
              onDropFromOther={state.addMany}
            />
          </div>
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

      {confirmAddSelected && (
        <div className={styles.backdrop} style={{ zIndex: 1100 }}>
          <div className={styles.confirmDialog}>
            <p>You have {state.checked.size} packet{state.checked.size === 1 ? '' : 's'} selected. Add {state.checked.size === 1 ? 'it' : 'them'} to the collection before saving?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={styles.button} onClick={() => setConfirmAddSelected(false)}>Keep editing</button>
              <button type="button" className={styles.button} onClick={() => { setConfirmAddSelected(false); runSaveChecks(); }}>Save without adding</button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => { state.transferRight(); setConfirmAddSelected(false); setPendingSaveAfterTransfer(true); }}
              >Add and save</button>
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
    </div>,
    document.body,
  );
}
