import { useState } from 'react';
import type { LayerId } from '../../model/types';
import { useUiStore } from '../../store/uiStore';
import styles from '../../styles/LayerPropertiesPanel.module.css';
import { ToggleSwitch } from './ToggleSwitch';

interface LayerSectionProps {
  title: string;
  layerId?: LayerId;
  alwaysOn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function LayerSection({
  title,
  layerId,
  alwaysOn,
  defaultOpen = true,
  children,
}: LayerSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const visibility = useUiStore((s) => s.layerVisibility);
  const setLayerVisible = useUiStore((s) => s.setLayerVisible);

  return (
    <div className={styles.section}>
      <div
        className={styles.header}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        {alwaysOn ? (
          <ToggleSwitch checked={true} onChange={() => {}} disabled title="Always visible" />
        ) : layerId ? (
          <ToggleSwitch
            checked={visibility[layerId]}
            onChange={(v) => setLayerVisible(layerId, v)}
            title={visibility[layerId] ? 'Hide' : 'Show'}
          />
        ) : null}
        <span className={styles.title}>{title}</span>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ''}`}>▸</span>
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
