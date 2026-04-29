import { useUiStore } from '../store/uiStore';
import styles from '../styles/ModeSwitcher.module.css';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { enterSeedStarting } from '../utils/enterSeedStarting';

export function ModeSwitcher() {
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);
  const { theme } = useActiveTheme();

  return (
    <div className={styles.switcher} role="group" aria-label="App mode">
      <button
        type="button"
        aria-pressed={appMode === 'garden'}
        className={`${styles.tab} ${appMode === 'garden' ? styles.active : ''}`}
        style={{ background: appMode === 'garden' ? theme.listHover : 'transparent' }}
        onClick={() => setAppMode('garden')}
      >
        Garden
      </button>
      <button
        type="button"
        aria-pressed={appMode === 'seed-starting'}
        className={`${styles.tab} ${appMode === 'seed-starting' ? styles.active : ''}`}
        style={{ background: appMode === 'seed-starting' ? theme.listHover : 'transparent' }}
        onClick={enterSeedStarting}
      >
        Seed Starting
      </button>
    </div>
  );
}
