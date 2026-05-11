import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import styles from './PlantsListView.module.css';
import { buildPlantRows, type PlantRow } from './plantsViewModel';

interface ColumnDef {
  id: string;
  label: string;
  render: (row: PlantRow) => ReactNode;
  numeric?: boolean;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'icon',
    label: '',
    defaultVisible: true,
    render: (r) => (r.iconImage ? <img src={r.iconImage} alt="" /> : null),
  },
  { id: 'name', label: 'Name', defaultVisible: true, render: (r) => r.name },
  { id: 'variety', label: 'Variety', defaultVisible: true, render: (r) => r.variety ?? '—' },
  { id: 'category', label: 'Category', defaultVisible: true, render: (r) => r.category ?? '—' },
  { id: 'location', label: 'Location', defaultVisible: true, render: (r) => r.location },
  { id: 'stage', label: 'Stage', defaultVisible: true, render: (r) => r.stage },
  {
    id: 'spacing',
    label: 'Spacing (ft)',
    defaultVisible: true,
    numeric: true,
    render: (r) => r.spacingFt ?? '—',
  },
  {
    id: 'height',
    label: 'Height (ft)',
    defaultVisible: true,
    numeric: true,
    render: (r) => r.heightFt ?? '—',
  },
  {
    id: 'footprint',
    label: 'Footprint (ft)',
    defaultVisible: true,
    numeric: true,
    render: (r) => r.footprintFt ?? '—',
  },
  {
    id: 'nextAction',
    label: 'Next action',
    defaultVisible: true,
    render: (r) => (r.nextAction ? `${r.nextAction.name} (${r.nextAction.earliest})` : '—'),
  },
  { id: 'rowId', label: 'ID', defaultVisible: false, render: (r) => r.id },
  { id: 'cultivarId', label: 'Cultivar ID', defaultVisible: false, render: (r) => r.cultivarId },
  { id: 'speciesId', label: 'Species ID', defaultVisible: false, render: (r) => r.speciesId },
  { id: 'parentId', label: 'Parent ID', defaultVisible: false, render: (r) => r.parentId ?? '—' },
  {
    id: 'position',
    label: 'Position',
    defaultVisible: false,
    render: (r) => (r.x == null || r.y == null ? '—' : `(${r.x.toFixed(2)}, ${r.y.toFixed(2)})`),
  },
  {
    id: 'climber',
    label: 'Climber',
    defaultVisible: false,
    render: (r) => (r.climber ? 'yes' : 'no'),
  },
  { id: 'iconPath', label: 'Icon path', defaultVisible: false, render: (r) => r.iconImage ?? '—' },
  {
    id: 'allActions',
    label: 'All actions',
    defaultVisible: false,
    render: (r) =>
      r.allActions.length === 0
        ? '—'
        : r.allActions.map((a) => `${a.label} @ ${a.earliest}`).join('; '),
  },
];

const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

export function PlantsListView() {
  const garden = useGardenStore((s) => s.garden);

  const rows: PlantRow[] = useMemo(() => buildPlantRows(garden, { actions: [] }), [garden]);

  const visibleColumns = COLUMNS.filter((c) => DEFAULT_VISIBLE.includes(c.id));

  if (rows.length === 0) {
    return <div className={styles.empty}>No plants in this garden.</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.id}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} aria-label={row.name}>
                {visibleColumns.map((col) => (
                  <td
                    key={col.id}
                    className={
                      col.numeric ? styles.numeric : col.id === 'icon' ? styles.iconCell : undefined
                    }
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
