import { createPortal } from 'react-dom';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/CollectionEditor.module.css';

interface Props {
  onClose: () => void;
}

export function WelcomeModal({ onClose }: Props) {
  const setCollectionEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);

  function openEditor() {
    setCollectionEditorOpen(true);
    onClose();
  }

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.confirmDialog} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Welcome</strong>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >×</button>
        </div>
        <p>Your seed collection is empty. Pick the cultivars you want to grow before laying out your garden.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className={styles.button} onClick={onClose}>Cancel</button>
          <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={openEditor}>
            Open Collection Editor
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
