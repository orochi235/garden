import styles from '../styles/MenuBar.module.css';

export function MenuBar() {
  return (
    <div className={styles.menuBar}>
      <div className={styles.title}>Garden Planner</div>
      <div className={styles.menus}>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
      </div>
    </div>
  );
}
