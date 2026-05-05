import { useUiStore } from '../../store/uiStore';
import type { CellSize } from '../../model/seedStarting';
import type { Season } from '../../model/species';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import f from '../../styles/PropertiesPanel.module.css';
import { LayerSection } from './LayerSection';
import { useEffect } from 'react';
import { useFrostZoneByLocation } from '../../hooks/useFrostZoneByLocation';

const CELL_SIZES: { value: CellSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

const SEASONS: { value: Season; label: string }[] = [
  { value: 'cool', label: 'Cool' },
  { value: 'warm', label: 'Warm' },
];

export function AlmanacPanel() {
  const filters = useUiStore((s) => s.almanacFilters);
  const setFilters = useUiStore((s) => s.setAlmanacFilters);
  const reset = useUiStore((s) => s.resetAlmanacFilters);
  const { status: locStatus, run: runLocate } = useFrostZoneByLocation();

  // When the lookup resolves, push the last-frost date into the filter store.
  // The dataset's `zone` field is currently derived from ANN-TMIN-NORMAL (mean
  // of daily lows), which is the wrong NOAA variable for USDA hardiness — it
  // produces wildly warm zones (e.g. zone-6a regions read as 11a). Until the
  // grid is rebuilt from a proper extreme-min source (USDA PHZM raster), do
  // not auto-fill `usdaZone`. See docs/TODO.md "Almanac" section.
  useEffect(() => {
    if (locStatus.kind !== 'ready') return;
    const year = new Date().getFullYear();
    const iso = `${year}-${locStatus.result.lastFrost}`;
    setFilters({ lastFrostDate: iso });
  }, [locStatus, setFilters]);

  function toggleCellSize(size: CellSize) {
    const next = filters.cellSizes.includes(size)
      ? filters.cellSizes.filter((s) => s !== size)
      : [...filters.cellSizes, size];
    setFilters({ cellSizes: next });
  }

  function toggleSeason(season: Season) {
    const next = filters.seasons.includes(season)
      ? filters.seasons.filter((s) => s !== season)
      : [...filters.seasons, season];
    setFilters({ seasons: next });
  }

  return (
    <LayerSection title="Almanac" defaultOpen>
      <div className={f.grid}>
        <span className={f.label}>Cell size</span>
        <div className={`${f.span12}`} style={{ display: 'flex', gap: 6 }}>
          {CELL_SIZES.map((s) => (
            <label key={s.value} className={styles.surfaceToggle} style={{ gridColumn: 'unset' }}>
              <input
                type="checkbox"
                checked={filters.cellSizes.includes(s.value)}
                onChange={() => toggleCellSize(s.value)}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>

        <span className={f.label}>Season</span>
        <div className={`${f.span12}`} style={{ display: 'flex', gap: 10 }}>
          {SEASONS.map((s) => (
            <label key={s.value} className={styles.surfaceToggle} style={{ gridColumn: 'unset' }}>
              <input
                type="checkbox"
                checked={filters.seasons.includes(s.value)}
                onChange={() => toggleSeason(s.value)}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>

        <span className={f.label}>USDA zone</span>
        <input
          className={`${f.input} ${f.span12}`}
          type="number"
          min={1}
          max={13}
          step={1}
          value={filters.usdaZone ?? ''}
          placeholder="Any"
          onChange={(e) => {
            const v = e.target.value;
            setFilters({ usdaZone: v === '' ? null : Math.max(1, Math.min(13, parseInt(v, 10) || 0)) });
          }}
        />

        <span className={f.label}>Last frost</span>
        <input
          className={`${f.input} ${f.span12}`}
          type="date"
          value={filters.lastFrostDate ?? ''}
          onChange={(e) => setFilters({ lastFrostDate: e.target.value || null })}
        />

        <span className={f.label}></span>
        <button
          className={`${f.input} ${f.span12}`}
          style={{ cursor: 'pointer', textAlign: 'center' }}
          onClick={runLocate}
          disabled={locStatus.kind === 'loading'}
        >
          {locStatus.kind === 'loading' ? 'Locating…' : 'Use my location'}
        </button>

        {locStatus.kind === 'ready' && (
          <>
            <span className={f.label}></span>
            <span className={f.span12} style={{ fontSize: 12, opacity: 0.75 }}>
              {`${locStatus.result.lat.toFixed(1)}, ${locStatus.result.lon.toFixed(1)} → last frost ${locStatus.result.lastFrost}`}
            </span>
          </>
        )}

        {locStatus.kind === 'error' && (
          <>
            <span className={f.label}></span>
            <span className={f.span12} style={{ fontSize: 12, color: '#c44' }}>
              {locStatus.message}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  runLocate();
                }}
              >
                try again
              </a>
            </span>
          </>
        )}

        <span className={f.label}></span>
        <button
          className={`${f.input} ${f.span12}`}
          style={{ cursor: 'pointer', textAlign: 'center' }}
          onClick={reset}
        >
          Reset filters
        </button>
      </div>
    </LayerSection>
  );
}
