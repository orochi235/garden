import type { DragPayload } from '@weasel-js/core';
import { useEffect, useMemo, useState } from 'react';
import { useCollectionEditorState } from '../../hooks/useCollectionEditorState';
import { findInUseRemovals } from '../../model/collection';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CultivarCategory,
  getAllCultivars,
} from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/CollectionEditor.module.css';
import { ConfirmDialog, Modal, modalStyles } from '../modal/Modal';
import { CollectionList } from './CollectionList';
import { CultivarDataGrid } from './CultivarDataGrid';
import { CultivarIconView } from './CultivarIconView';

type ViewMode = 'list' | 'icons';

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

  const pendingIds = useMemo(() => new Set(state.pending.map((c) => c.id)), [state.pending]);
  const leftSource = useMemo(
    () => database.filter((c) => !pendingIds.has(c.id)),
    [database, pendingIds],
  );
  const visible = useMemo(() => state.visibleCultivars(leftSource), [state, leftSource]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && e.shiftKey && state.checked.size > 0) {
        e.preventDefault();
        state.transferRight();
        return;
      }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        state.selectAll(visible.map((c) => c.id));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, visible]);
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
    const inUse = findInUseRemovals(removed, garden.plantings, garden.nursery.seedlings);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: runSaveChecks is recreated each render; this effect fires on the transfer-completion signal and calls the latest closure.
  useEffect(() => {
    if (pendingSaveAfterTransfer && state.checked.size === 0) {
      setPendingSaveAfterTransfer(false);
      runSaveChecks();
    }
  }, [pendingSaveAfterTransfer, state.checked.size]);

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

  return (
    <Modal
      title="Collection"
      onClose={attemptCancel}
      className={styles.editorDialog}
      actions={
        <>
          <button type="button" className={modalStyles.button} onClick={attemptCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${modalStyles.button} ${modalStyles.primary}`}
            onClick={attemptSave}
            disabled={!state.dirty}
          >
            Save
          </button>
        </>
      }
    >
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
            >
              Add {state.checked.size > 0 ? `(${state.checked.size})` : ''} ›
            </button>
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
              <button
                type="button"
                key={cat}
                className={`${styles.chip} ${state.categories.has(cat) ? styles.chipActive : ''} ${categoryCounts[cat] ? '' : styles.chipEmpty}`}
                aria-pressed={state.categories.has(cat)}
                onClick={() => toggleCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}{' '}
                <span className={styles.chipCount}>{categoryCounts[cat] ?? 0}</span>
              </button>
            ))}
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                ☰
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'icons' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('icons')}
                title="Icon view"
              >
                ▦
              </button>
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
      {confirmDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          onClose={() => setConfirmDiscard(false)}
          actions={
            <>
              <button
                type="button"
                className={modalStyles.button}
                onClick={() => setConfirmDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className={`${modalStyles.button} ${modalStyles.primary}`}
                onClick={performCancel}
              >
                Discard
              </button>
            </>
          }
        >
          Your changes to the collection haven't been saved.
        </ConfirmDialog>
      )}

      {confirmAddSelected && (
        <ConfirmDialog
          title="Add selected packets?"
          onClose={() => setConfirmAddSelected(false)}
          actions={
            <>
              <button
                type="button"
                className={modalStyles.button}
                onClick={() => setConfirmAddSelected(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className={modalStyles.button}
                onClick={() => {
                  setConfirmAddSelected(false);
                  runSaveChecks();
                }}
              >
                Save without adding
              </button>
              <button
                type="button"
                className={`${modalStyles.button} ${modalStyles.primary}`}
                onClick={() => {
                  state.transferRight();
                  setConfirmAddSelected(false);
                  setPendingSaveAfterTransfer(true);
                }}
              >
                Add and save
              </button>
            </>
          }
        >
          You have {state.checked.size} packet{state.checked.size === 1 ? '' : 's'} selected. Add{' '}
          {state.checked.size === 1 ? 'it' : 'them'} to the collection before saving?
        </ConfirmDialog>
      )}

      {warnRemovals && (
        <ConfirmDialog
          title="Remove cultivars in use?"
          onClose={() => setWarnRemovals(null)}
          actions={
            <>
              <button
                type="button"
                className={modalStyles.button}
                onClick={() => setWarnRemovals(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${modalStyles.button} ${modalStyles.primary}`}
                onClick={performSave}
              >
                Save anyway
              </button>
            </>
          }
        >
          <p>
            {warnRemovals.length} cultivar{warnRemovals.length === 1 ? '' : 's'} in your garden will
            no longer appear in palettes:
          </p>
          <ul>
            {warnRemovals.map((id) => {
              const c =
                garden.collection.find((cc) => cc.id === id) ?? database.find((cc) => cc.id === id);
              return <li key={id}>{c?.name ?? id}</li>;
            })}
          </ul>
          <p>Existing plantings will remain.</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
