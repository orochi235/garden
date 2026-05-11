import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import styles from './PlantsListView.module.css';
import { buildPlantRows, type PlantRow } from './plantsViewModel';
import { buildSchedule, type Schedule } from '../../model/scheduler';
import { defaultActionsForCultivar } from '../../model/defaultActions';
import { getCultivar } from '../../model/cultivars';
import { defaultTargetDate } from '../schedule/scheduleViewModel';

interface ColumnDef {
  id: string;
  label: string;
  render: (row: PlantRow) => ReactNode;
  numeric?: boolean;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { id: 'icon', label: '●', defaultVisible: true,
    render: (r) => r.iconImage ? <img src={r.iconImage} alt="" /> : null },
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

const LS_KEY = 'plantsListView.visibleColumns';

function readVisibleColumns(): string[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
      return DEFAULT_VISIBLE;
    }
    return parsed;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

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
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelection = useUiStore((s) => s.setSelection);
  const setAppMode = useUiStore((s) => s.setAppMode);
  const setCurrentTrayId = useUiStore((s) => s.setCurrentTrayId);

  const almanacLastFrost = useUiStore((s) => s.almanacFilters?.lastFrostDate ?? null);

  const schedule: Schedule = useMemo(() => {
    const plants = [
      ...garden.plantings.map((p) => ({ id: p.id, cultivarId: p.cultivarId, label: p.label })),
      ...garden.seedStarting.seedlings.map((s) => ({
        id: s.id, cultivarId: s.cultivarId, label: undefined as string | undefined,
      })),
    ]
      .map((p) => {
        const cv = getCultivar(p.cultivarId);
        if (!cv) return null;
        return {
          id: p.id,
          cultivarId: p.cultivarId,
          label: p.label ?? cv.name,
          actions: defaultActionsForCultivar(cv),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return buildSchedule({
      plants,
      targetTransplantDate: almanacLastFrost ?? defaultTargetDate(),
      lastFrostDate: almanacLastFrost ?? undefined,
    });
  }, [garden, almanacLastFrost]);

  const rows: PlantRow[] = useMemo(
    () => buildPlantRows(garden, schedule),
    [garden, schedule],
  );

  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchText, setSearchText] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'planting' | 'seedling'>('all');
  const [visibleIds, setVisibleIds] = useState<string[]>(() => readVisibleColumns());
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const visibleColumns = COLUMNS.filter((c) => visibleIds.includes(c.id));

  function toggleColumn(id: string) {
    setVisibleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter === 'planting' && r.kind !== 'planting') return false;
      if (stageFilter === 'seedling' && r.kind !== 'seedling') return false;
      if (!q) return true;
      const haystack = [r.name, r.variety ?? '', r.location, r.cultivarId, r.id]
        .join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchText, stageFilter]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => compareRows(a, b, sortColumn));
    return sortDir === 'asc' ? arr : arr.reverse();
  }, [filteredRows, sortColumn, sortDir]);

  function onHeaderClick(colId: string) {
    if (colId === sortColumn) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colId);
      setSortDir('asc');
    }
  }

  function handleRowClick(row: PlantRow) {
    if (row.kind === 'seedling' && row.parentId) {
      setAppMode('seed-starting');
      setCurrentTrayId(row.parentId);
    }
    setSelection([row.id]);
  }

  if (rows.length === 0) {
    return <div className={styles.empty}>No plants in this garden.</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search name, variety, location…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className={styles.chips}>
          {(['all', 'planting', 'seedling'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${stageFilter === s ? styles.chipActive : ''}`}
              onClick={() => setStageFilter(s)}
            >
              {s === 'all' ? 'All' : s === 'planting' ? 'Plantings' : 'Seedlings'}
            </button>
          ))}
        </div>
        <div className={styles.colEditor}>
          <button type="button" onClick={() => setColumnEditorOpen((v) => !v)}>
            Columns ▾
          </button>
          {columnEditorOpen && (
            <div className={styles.colEditorPopover}>
              {COLUMNS.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={visibleIds.includes(c.id)}
                    onChange={() => toggleColumn(c.id)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
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
              <tr
                key={row.id}
                aria-label={row.name}
                className={selectedIds.includes(row.id) ? styles.rowActive : undefined}
                onClick={() => handleRowClick(row)}
              >
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
        {sortedRows.length === 0 && (
          <div className={styles.empty}>
            No plants match these filters.{' '}
            <button
              type="button"
              onClick={() => { setSearchText(''); setStageFilter('all'); }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
