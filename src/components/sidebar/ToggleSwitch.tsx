import styles from '../../styles/ToggleSwitch.module.css';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, title, disabled }: Props) {
  return (
    <button
      className={`${styles.toggle} ${checked ? styles.on : ''} ${disabled ? styles.disabled : ''}`}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      title={title}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
    >
      <span className={styles.thumb} />
    </button>
  );
}
