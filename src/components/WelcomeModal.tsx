import { useUiStore } from '../store/uiStore';
import { markWelcomeSeen } from '../utils/file';
import { ConfirmDialog, modalStyles } from './modal/Modal';

interface Props {
  onClose: () => void;
}

export function WelcomeModal({ onClose }: Props) {
  const setCollectionEditorOpen = useUiStore((s) => s.setCollectionEditorOpen);

  function close() {
    markWelcomeSeen();
    onClose();
  }

  return (
    <ConfirmDialog
      title="Welcome"
      onClose={close}
      actions={
        <>
          <button type="button" className={modalStyles.button} onClick={close}>
            Not now
          </button>
          <button
            type="button"
            className={`${modalStyles.button} ${modalStyles.primary}`}
            onClick={() => {
              close();
              setCollectionEditorOpen(true);
            }}
          >
            Edit Collection…
          </button>
        </>
      }
    >
      Your collection is empty. Pick the cultivars you want to grow before laying out your garden.
    </ConfirmDialog>
  );
}
