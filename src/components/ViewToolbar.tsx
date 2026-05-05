import type { JSX } from 'react';
import type { ViewMode } from '../store/uiStore';
import { useUiStore } from '../store/uiStore';
import { resetCurrentCanvasView } from '../actions/view/resetView';
import styles from '../styles/ViewToolbar.module.css';

const icons: Record<ViewMode, JSX.Element> = {
  select: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 1 L3 12 L6.5 8.5 L10.5 13 L12.5 11.5 L8.5 7 L13 6 Z" />
    </svg>
  ),
  'select-area': (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 2h3M11 2h3M2 2v3M14 2v3" />
      <path d="M2 11v3M14 11v3M2 14h3M11 14h3" />
    </svg>
  ),
  pan: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 9V3.5a1 1 0 0 1 2 0V8" />
      <path d="M7.5 7V2.5a1 1 0 0 1 2 0V8" />
      <path d="M9.5 7.5V4a1 1 0 0 1 2 0v4.5" />
      <path d="M5.5 9a1 1 0 0 0-2 0v1.5c0 2.5 2 4 4.5 4s4.5-1.5 4.5-4V8a1 1 0 0 0-2 0" />
      <path d="M5.5 5.5V1.5a1 1 0 0 0-2 0V9" />
    </svg>
  ),
  zoom: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.2 10.2 L14.5 14.5" />
      <path d="M5 7h4" />
      <path d="M7 5v4" />
    </svg>
  ),
  draw: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 11.5 L10.5 3 L13 5.5 L4.5 14 H2 V11.5Z" />
      <path d="M9 4.5 L11.5 7" />
    </svg>
  ),
};

const tools: { mode: ViewMode; label: string }[] = [
  { mode: 'select', label: 'Select' },
  { mode: 'select-area', label: 'Select Area' },
  { mode: 'draw', label: 'Draw' },
  { mode: 'pan', label: 'Pan' },
  { mode: 'zoom', label: 'Zoom' },
];

export function ViewToolbar() {
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  return (
    <div className={styles.container}>
      {tools.map((t) => (
        <button
          key={t.mode}
          className={`${styles.button} ${viewMode === t.mode ? styles.active : ''}`}
          onClick={() => setViewMode(t.mode)}
          onDoubleClick={t.mode === 'zoom' ? resetCurrentCanvasView : undefined}
          title={t.label}
        >
          <span className={styles.icon}>{icons[t.mode]}</span>
        </button>
      ))}
    </div>
  );
}
