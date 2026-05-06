import { useEffect, useRef, useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { zoomToTray } from '../actions/view/resetView';
import styles from '../styles/FloatingTraySwitcher.module.css';

export function FloatingTraySwitcher() {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const seedlings = useGardenStore((s) => s.garden.seedStarting.seedlings);
  const renameTray = useGardenStore((s) => s.renameTray);
  const removeTray = useGardenStore((s) => s.removeTray);
  const reorderTrays = useGardenStore((s) => s.reorderTrays);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  // Drop position is "insertion slot" — index in [0, trays.length] meaning
  // "insert before trays[i]" (or at the end if i === trays.length).
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  function startEditing(id: string, currentLabel: string) {
    setEditingId(id);
    setDraftLabel(currentLabel);
  }

  function commitEdit() {
    if (!editingId) return;
    const trimmed = draftLabel.trim();
    if (trimmed) renameTray(editingId, trimmed);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleDelete(e: React.MouseEvent, trayId: string, label: string) {
    e.stopPropagation();
    const seedlingCount = seedlings.filter((s) => s.trayId === trayId).length;
    const msg =
      seedlingCount > 0
        ? `Delete tray "${label}" and its ${seedlingCount} seedling${seedlingCount === 1 ? '' : 's'}?`
        : `Delete tray "${label}"?`;
    if (!window.confirm(msg)) return;
    removeTray(trayId);
    if (currentTrayId === trayId) {
      const remaining = trays.filter((t) => t.id !== trayId);
      setCurrentTrayId(remaining[0]?.id ?? null);
    }
  }

  function onRowDragStart(e: React.DragEvent<HTMLDivElement>, index: number) {
    setDragFromIndex(index);
    setDropSlot(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Some browsers require setData for drag to initiate.
      try {
        e.dataTransfer.setData('text/plain', String(index));
      } catch {
        // ignore
      }
    }
  }

  function onRowDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    if (dragFromIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // Determine whether the pointer is in the upper or lower half of the row.
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const slot = before ? index : index + 1;
    setDropSlot(slot);
  }

  function onRowDrop(e: React.DragEvent<HTMLDivElement>) {
    if (dragFromIndex === null || dropSlot === null) {
      clearDragState();
      return;
    }
    e.preventDefault();
    // Convert insertion-slot to destination-index after the source is removed.
    const from = dragFromIndex;
    let to = dropSlot;
    if (to > from) to -= 1;
    if (to !== from) reorderTrays(from, to);
    clearDragState();
  }

  function onRowDragEnd() {
    clearDragState();
  }

  function clearDragState() {
    setDragFromIndex(null);
    setDropSlot(null);
  }

  if (trays.length === 0) return null;

  return (
    <div className={styles.root} role="listbox" aria-label="Active trays">
      {trays.map((t, index) => {
        const active = t.id === currentTrayId;
        if (editingId === t.id) {
          return (
            <input
              key={t.id}
              ref={inputRef}
              className={styles.editInput}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                else if (e.key === 'Escape') cancelEdit();
              }}
            />
          );
        }
        const showInsertionBefore =
          dragFromIndex !== null && dropSlot === index && dropSlot !== dragFromIndex && dropSlot !== dragFromIndex + 1;
        const showInsertionAfter =
          dragFromIndex !== null &&
          index === trays.length - 1 &&
          dropSlot === trays.length &&
          dropSlot !== dragFromIndex &&
          dropSlot !== dragFromIndex + 1;
        const isDragging = dragFromIndex === index;
        return (
          <div key={t.id} className={styles.rowWrapper}>
            {showInsertionBefore && <div className={styles.insertionLine} data-testid="insertion-line-before" />}
            <div
              role="option"
              aria-selected={active}
              data-tray-id={t.id}
              data-tray-index={index}
              className={`${styles.row} ${active ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}
              draggable
              onDragStart={(e) => onRowDragStart(e, index)}
              onDragOver={(e) => onRowDragOver(e, index)}
              onDrop={onRowDrop}
              onDragEnd={onRowDragEnd}
            >
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  setCurrentTrayId(t.id);
                  zoomToTray(t.id);
                }}
                onDoubleClick={() => startEditing(t.id, t.label)}
                title={`${t.label} (double-click to rename, drag to reorder)`}
              >
                {t.label}
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={(e) => handleDelete(e, t.id, t.label)}
                aria-label={`Delete tray ${t.label}`}
                title="Delete tray"
              >
                ×
              </button>
            </div>
            {showInsertionAfter && <div className={styles.insertionLine} data-testid="insertion-line-after" />}
          </div>
        );
      })}
    </div>
  );
}
