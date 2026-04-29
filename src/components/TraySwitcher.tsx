import { useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { TRAY_CATALOG, instantiatePreset } from '../model/trayCatalog';
import styles from '../styles/TraySwitcher.module.css';

interface Props {
  onOpenCustomBuilder: () => void;
}

export function TraySwitcher({ onOpenCustomBuilder }: Props) {
  const trays = useGardenStore((s) => s.garden.seedStarting.trays);
  const addTray = useGardenStore((s) => s.addTray);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);
  const [open, setOpen] = useState(false);

  const current = trays.find((t) => t.id === currentTrayId);

  function handleNewFromPreset(presetId: string) {
    const tray = instantiatePreset(presetId);
    if (!tray) return;
    addTray(tray);
    setCurrentTrayId(tray.id);
    setOpen(false);
  }

  return (
    <div className={styles.switcher}>
      <button className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        Tray: {current?.label ?? '(none)'} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {trays.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Your Trays</div>
              {trays.map((t) => (
                <button
                  key={t.id}
                  className={styles.item}
                  onClick={() => {
                    setCurrentTrayId(t.id);
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
              <button key={p.id} className={styles.item} onClick={() => handleNewFromPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.section}>
            <button
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onOpenCustomBuilder();
              }}
            >
              Custom tray…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
