import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  canTransferRight: boolean;
  canTransferLeft: boolean;
  onTransferRight: () => void;
  onTransferLeft: () => void;
}

export function TransferControls({ canTransferRight, canTransferLeft, onTransferRight, onTransferLeft }: Props) {
  return (
    <div className={styles.transfer}>
      <button
        type="button"
        className={styles.transferButton}
        onClick={onTransferRight}
        disabled={!canTransferRight}
        title="Add selected to collection"
      >›</button>
      <button
        type="button"
        className={styles.transferButton}
        onClick={onTransferLeft}
        disabled={!canTransferLeft}
        title="Remove selected from collection"
      >‹</button>
    </div>
  );
}
