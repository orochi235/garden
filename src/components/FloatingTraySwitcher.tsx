import { useEffect, useRef, useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/FloatingTraySwitcher.module.css';

export function FloatingTraySwitcher() {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const seedlings = useGardenStore((s) => s.garden.seedStarting.seedlings);
  const renameTray = useGardenStore((s) => s.renameTray);
  const removeTray = useGardenStore((s) => s.removeTray);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  if (trays.length === 0) return null;

  return (
    <div className={styles.root} role="listbox" aria-label="Active trays">
      {trays.map((t) => {
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
        return (
          <div
            key={t.id}
            role="option"
            aria-selected={active}
            className={`${styles.row} ${active ? styles.active : ''}`}
          >
            <button
              type="button"
              className={styles.item}
              onClick={() => setCurrentTrayId(t.id)}
              onDoubleClick={() => startEditing(t.id, t.label)}
              title={`${t.label} (double-click to rename)`}
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
        );
      })}
    </div>
  );
}
