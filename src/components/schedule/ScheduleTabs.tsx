import styles from './ScheduleView.module.css';

export type ScheduleTab = 'list' | 'calendar';

export interface ScheduleTabsProps {
  active: ScheduleTab;
  onChange: (tab: ScheduleTab) => void;
}

export function ScheduleTabs({ active, onChange }: ScheduleTabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      <TabBtn label="List" active={active === 'list'} onClick={() => onChange('list')} />
      <TabBtn label="Calendar" active={active === 'calendar'} onClick={() => onChange('calendar')} />
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`${styles.tabBtn}${active ? ` ${styles.tabBtnActive}` : ''}`}
    >{label}</button>
  );
}
