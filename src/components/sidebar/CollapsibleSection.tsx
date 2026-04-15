import { useState } from 'react';
import styles from '../../styles/CollapsibleSection.module.css';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        <span className={`${styles.arrow} ${open ? styles.arrowOpen : ''}`}>▸</span>
        <span className={styles.title}>{title}</span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
