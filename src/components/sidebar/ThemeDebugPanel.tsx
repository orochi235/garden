import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import type { TimePeriod } from '../../utils/timeTheme';
import { ALL_PERIODS, getTheme } from '../../utils/timeTheme';
import { LayerSection } from './LayerSection';

export function ThemeDebugPanel() {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const setThemeOverride = useUiStore((s) => s.setThemeOverride);

  return (
    <LayerSection title="Theme (debug)" defaultOpen={false}>
      <div className={styles.themeGrid}>
        <button
          className={`${styles.themeSwatch} ${themeOverride === null ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride(null)}
          title="Live (clock-based)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'conic-gradient(from 90deg, #E8A868, #60C8E8, #48C0E0, #804878, #1A2744, #E8A868)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Live</span>
        </button>
        <button
          className={`${styles.themeSwatch} ${themeOverride === 'slow-cycle' ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride('slow-cycle')}
          title="Slow cycle (20s crossfade)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'linear-gradient(90deg, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Slow</span>
        </button>
        <button
          className={`${styles.themeSwatch} ${themeOverride === 'cycle' ? styles.themeSwatchActive : ''}`}
          onClick={() => setThemeOverride('cycle')}
          title="Fast cycle (5s crossfade)"
        >
          <span
            className={styles.themeSwatchColor}
            style={{
              background:
                'linear-gradient(90deg, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828, #E8A868, #60C8E8, #48C0E0, #804878, #3E2E60, #1A2744, #101828)',
            }}
          />
          <span className={styles.themeSwatchLabel}>Fast</span>
        </button>
      </div>
      <hr className={styles.themeDivider} />
      <div className={styles.themeGrid}>
        {ALL_PERIODS.map((period: TimePeriod) => (
          <button
            key={period}
            className={`${styles.themeSwatch} ${themeOverride === period ? styles.themeSwatchActive : ''}`}
            onClick={() => setThemeOverride(period)}
            title={period}
          >
            <span
              className={styles.themeSwatchColor}
              style={{ background: getTheme(period).menuBarBg }}
            />
            <span className={styles.themeSwatchLabel}>{period}</span>
          </button>
        ))}
      </div>
    </LayerSection>
  );
}
