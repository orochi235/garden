import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/FloatingTraySwitcher.module.css';

export function FloatingTraySwitcher() {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  if (trays.length === 0) return null;

  return (
    <div className={styles.root} role="listbox" aria-label="Active trays">
      {trays.map((t) => {
        const active = t.id === currentTrayId;
        return (
          <button
            key={t.id}
            role="option"
            aria-selected={active}
            className={`${styles.item} ${active ? styles.active : ''}`}
            onClick={() => setCurrentTrayId(t.id)}
            title={t.label}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
