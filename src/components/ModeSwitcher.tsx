import { useUiStore } from '../store/uiStore';
import styles from '../styles/ModeSwitcher.module.css';
import { enterNursery } from '../utils/enterNursery';

export function ModeSwitcher() {
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);

  return (
    <div className={styles.switcher} role="group" aria-label="App mode">
      <button
        type="button"
        aria-pressed={appMode === 'garden'}
        className={`${styles.tab} ${appMode === 'garden' ? styles.active : ''}`}
        data-label="Garden"
        onClick={() => setAppMode('garden')}
      >
        <span>Garden</span>
      </button>
      <button
        type="button"
        aria-pressed={appMode === 'nursery'}
        className={`${styles.tab} ${appMode === 'nursery' ? styles.active : ''}`}
        data-label="Nursery"
        onClick={enterNursery}
      >
        <span>Nursery</span>
      </button>
    </div>
  );
}
