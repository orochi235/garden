import { useEffect, useMemo, useState } from 'react';
import { findInUseRemovals } from '../../model/collection';
import { getAllCultivars, type CultivarCategory } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/CollectionEditor.module.css';
import { useCollectionEditorState } from '../../hooks/useCollectionEditorState';
import { CultivarDataGrid } from './CultivarDataGrid';
import { CollectionList } from './CollectionList';

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
  const database = useMemo(() => getAllCultivars(), []);
  const state = useCollectionEditorState(garden.collection, database);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [warnRemovals, setWarnRemovals] = useState<string[] | null>(null);

  const pendingIds = useMemo(() => new Set(state.pending.map((c) => c.id)), [state.pending]);
  const leftSource = useMemo(
    () => database.filter((c) => !pendingIds.has(c.id)),
    [database, pendingIds],
  );
  const visible = useMemo(() => state.visibleCultivars(leftSource), [state, leftSource]);

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

  function dragStart(id: string, e: React.DragEvent) {
    e.dataTransfer.setData('application/x-cultivar-id-from-other', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function toggleCategory(cat: CultivarCategory) {
    const next = new Set(state.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    state.setCategories(next);
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>Collection</div>
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
                  {CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
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
              onCultivarDragStart={dragStart}
              onCultivarDragEnd={() => {}}
            />
          </div>
          <div className={styles.right}>
            <div className={styles.paneTitle}>
              <span>In Collection ({state.pending.length})</span>
            </div>
            <CollectionList
              collection={state.pending}
              onRemove={state.removeOne}
              onDropFromOther={state.addOne}
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
