import { useEffect, useMemo, useRef, useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { TRAY_CATALOG, instantiatePreset } from '../model/trayCatalog';
import { zoomToTray } from '../actions/view/resetView';
import styles from '../styles/TraySwitcher.module.css';
import { ScheduleView } from './schedule/ScheduleView';

interface Props {
  onOpenCustomBuilder: () => void;
}

export function TraySwitcher({ onOpenCustomBuilder }: Props) {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const addTray = useGardenStore((s) => s.addTray);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);
  const [open, setOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const tray = trays.find((t) => t.id === currentTrayId);
  // Subscribe to the seedlings array reference (stable across unrelated
  // updates), then derive the per-tray slice + plants list with useMemo so
  // the array identity doesn't churn on every render — `useSyncExternalStore`
  // would otherwise loop "result of getSnapshot should be cached".
  const allSeedlings = useGardenStore((s) => s.garden.seedStarting.seedlings);
  const trayPlants = useMemo(() => {
    if (!tray) return [];
    return allSeedlings
      .filter((sd) => sd.trayId === tray.id)
      .map((sd) => ({ id: sd.id, cultivarId: sd.cultivarId }));
  }, [allSeedlings, tray]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const current = trays.find((t) => t.id === currentTrayId);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleNewFromPreset(presetId: string) {
    const tray = instantiatePreset(presetId);
    if (!tray) return;
    addTray(tray);
    setCurrentTrayId(tray.id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={styles.switcher}>
      <button
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Tray: {current?.label ?? '(none)'} <span aria-hidden>▾</span>
      </button>
      {tray && (
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setScheduleOpen((v) => !v)}
          aria-expanded={scheduleOpen}
        >
          Schedule
        </button>
      )}
      {scheduleOpen && tray && (
        <div className={styles.schedulePopover}>
          <ScheduleView plants={trayPlants} />
        </div>
      )}
      {open && (
        <div className={styles.menu} role="menu">
          {trays.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Your Trays</div>
              {trays.map((t) => (
                <button
                  key={t.id}
                  role="menuitem"
                  className={styles.item}
                  onClick={() => {
                    setCurrentTrayId(t.id);
                    zoomToTray(t.id);
                    setOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>New from preset</div>
            {TRAY_CATALOG.map((p) => (
              <button
                key={p.id}
                role="menuitem"
                className={styles.item}
                onClick={() => handleNewFromPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.section}>
            <button
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onOpenCustomBuilder();
              }}
            >
              Custom tray<span aria-hidden>…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
