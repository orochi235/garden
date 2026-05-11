import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
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

function compareRows(a: PlantRow, b: PlantRow, columnId: string): number {
  const valueFor = (r: PlantRow): string | number | undefined => {
    switch (columnId) {
      case 'name': return r.name;
      case 'variety': return r.variety ?? '';
      case 'category': return r.category ?? '';
      case 'location': return r.location;
      case 'stage': return r.stage;
      case 'spacing': return r.spacingFt;
      case 'height': return r.heightFt;
      case 'footprint': return r.footprintFt;
      case 'nextAction': return r.nextAction?.earliest ?? '';
      case 'rowId': return r.id;
      case 'cultivarId': return r.cultivarId;
      case 'speciesId': return r.speciesId;
      case 'parentId': return r.parentId ?? '';
      case 'position':
        return r.x == null || r.y == null ? Number.POSITIVE_INFINITY : r.x * 10000 + r.y;
      case 'climber': return r.climber ? 1 : 0;
      case 'iconPath': return r.iconImage ?? '';
      case 'allActions': return r.allActions.length;
      default: return r.name;
    }
  };
  const av = valueFor(a);
  const bv = valueFor(b);
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}

export function PlantsListView() {
  const garden = useGardenStore((s) => s.garden);

  const rows: PlantRow[] = useMemo(() => buildPlantRows(garden, { actions: [] }), [garden]);

  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const visibleColumns = COLUMNS.filter((c) => DEFAULT_VISIBLE.includes(c.id));

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => compareRows(a, b, sortColumn));
    return sortDir === 'asc' ? arr : arr.reverse();
  }, [rows, sortColumn, sortDir]);

  function onHeaderClick(colId: string) {
    if (colId === sortColumn) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colId);
      setSortDir('asc');
    }
  }

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
                <th key={col.id} onClick={() => onHeaderClick(col.id)}>
                  {col.label}{sortColumn === col.id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} aria-label={row.name}>
                {visibleColumns.map((col) => (
                  <td
                    key={col.id}
                    className={col.numeric ? styles.numeric : (col.id === 'icon' ? styles.iconCell : undefined)}
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
