import { useUiStore } from '../store/uiStore';
import styles from '../styles/SeedWarningsToggle.module.css';

export function SeedWarningsToggle() {
  const show = useUiStore((s) => s.showSeedlingWarnings);
  const setShow = useUiStore((s) => s.setShowSeedlingWarnings);
  return (
    <label className={styles.container}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={show}
        onChange={(e) => setShow(e.target.checked)}
      />
      <span>Show warnings</span>
    </label>
  );
}
