import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface Props {
  title: string;
  onClose: () => void;
  /** Sizes the dialog box; the shell supplies everything else. */
  className?: string;
  /** Header actions rendered before the close button. */
  headerExtra?: ReactNode;
  /** Buttons along the bottom edge. */
  actions?: ReactNode;
  children: ReactNode;
}

// Open modals, innermost last: Escape closes only the top one.
const stack: object[] = [];

export function Modal({ title, onClose, className, headerExtra, actions, children }: Props) {
  const titleId = useId();
  const token = useRef({}).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    stack.push(token);
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || stack[stack.length - 1] !== token) return;
      e.preventDefault();
      onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
    };
  }, [token]);

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${styles.dialog} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {headerExtra}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A small Modal whose body is a message and whose actions answer it. */
export function ConfirmDialog({
  title,
  onClose,
  actions,
  children,
}: Pick<Props, 'title' | 'onClose' | 'actions' | 'children'>) {
  return (
    <Modal title={title} onClose={onClose} className={styles.confirm} actions={actions}>
      <div className={styles.message}>{children}</div>
    </Modal>
  );
}

export { styles as modalStyles };
