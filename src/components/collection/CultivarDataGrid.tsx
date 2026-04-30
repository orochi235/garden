import { useEffect, useMemo, useRef } from 'react';
import type { Cultivar, CultivarCategory } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import styles from '../../styles/CollectionEditor.module.css';
import type { SortColumn, SortDir, TriState } from '../../hooks/useCollectionEditorState';
import { useDragHandle, type DragPayload } from '@/canvas-kit';

interface Props {
  visibleCultivars: Cultivar[];
  expandedSpecies: Set<string>;
  onSpeciesExpandToggle: (speciesId: string) => void;
  isChecked: (id: string) => boolean;
  onCultivarToggle: (id: string) => void;
  speciesTriState: (visibleChildren: Cultivar[]) => TriState;
  onSpeciesToggle: (visibleChildren: Cultivar[]) => void;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSortChange: (column: SortColumn) => void;
  getDragPayload: (id: string) => DragPayload;
}

const CATEGORY_LABELS: Record<CultivarCategory, string> = {
  vegetables: 'Vegetable',
  greens: 'Green',
  fruits: 'Fruit',
  squash: 'Squash',
  'root-vegetables': 'Root',
  legumes: 'Legume',
  herbs: 'Herb',
  flowers: 'Flower',
};

interface Group {
  speciesId: string;
  speciesName: string;
  children: Cultivar[];
}

function compareCultivars(a: Cultivar, b: Cultivar, col: SortColumn, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const sa = getSpecies(a.speciesId);
  const sb = getSpecies(b.speciesId);
  const fields: Record<SortColumn, [string, string]> = {
    name: [a.name, b.name],
    variety: [a.variety ?? '', b.variety ?? ''],
    species: [sa?.name ?? '', sb?.name ?? ''],
    category: [a.category, b.category],
    taxonomic: [sa?.taxonomicName ?? '', sb?.taxonomicName ?? ''],
  };
  const [va, vb] = fields[col];
  return sign * va.localeCompare(vb);
}

export function CultivarDataGrid(props: Props) {
  const groups = useMemo<Group[]>(() => {
    const bySpecies = new Map<string, Cultivar[]>();
    for (const c of props.visibleCultivars) {
      const list = bySpecies.get(c.speciesId) ?? [];
      list.push(c);
      bySpecies.set(c.speciesId, list);
    }
    const out: Group[] = [];
    for (const [speciesId, children] of bySpecies) {
      const sorted = [...children].sort((a, b) => compareCultivars(a, b, props.sortColumn, props.sortDir));
      out.push({
        speciesId,
        speciesName: getSpecies(speciesId)?.name ?? speciesId,
        children: sorted,
      });
    }
    out.sort((a, b) => a.speciesName.localeCompare(b.speciesName));
    return out;
  }, [props.visibleCultivars, props.sortColumn, props.sortDir]);

  function header(col: SortColumn, label: string) {
    const arrow = props.sortColumn === col ? (props.sortDir === 'asc' ? '▲' : '▼') : '';
    return (
      <div className={styles.sortable} onClick={() => props.onSortChange(col)}>
        {label}
        {arrow && <span className={styles.sortArrow}>{arrow}</span>}
      </div>
    );
  }

  return (
    <div className={styles.gridWrap}>
      <div className={styles.grid}>
        <div className={styles.gridHeader}>
          <div />
          <div />
          <div />
          <div />
          {header('name', 'Name')}
          {header('category', 'Category')}
          {header('taxonomic', 'Taxonomic')}
        </div>
        {groups.length === 0 && (
          <div className={styles.emptyMessage} style={{ gridColumn: '1 / -1' }}>
            No cultivars match
          </div>
        )}
        {groups.map((g) => (
          <SpeciesBlock
            key={g.speciesId}
            group={g}
            expanded={props.expandedSpecies.has(g.speciesId)}
            triState={props.speciesTriState(g.children)}
            isChecked={props.isChecked}
            onSpeciesToggle={() => props.onSpeciesToggle(g.children)}
            onSpeciesExpandToggle={() => props.onSpeciesExpandToggle(g.speciesId)}
            onCultivarToggle={props.onCultivarToggle}
            getDragPayload={props.getDragPayload}
          />
        ))}
      </div>
    </div>
  );
}

interface BlockProps {
  group: Group;
  expanded: boolean;
  triState: TriState;
  isChecked: (id: string) => boolean;
  onSpeciesToggle: () => void;
  onSpeciesExpandToggle: () => void;
  onCultivarToggle: (id: string) => void;
  getDragPayload: (id: string) => DragPayload;
}

function SpeciesBlock(props: BlockProps) {
  const triRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (triRef.current) triRef.current.indeterminate = props.triState === 'some';
  }, [props.triState]);

  if (props.group.children.length === 1) {
    const c = props.group.children[0];
    const taxonomic = getSpecies(c.speciesId)?.taxonomicName ?? '';
    const label = c.variety ? `${props.group.speciesName} — ${c.variety}` : props.group.speciesName;
    return (
      <CultivarRow
        cultivar={c}
        getDragPayload={props.getDragPayload}
      >
        <div />
        <div>
          <input
            type="checkbox"
            checked={props.isChecked(c.id)}
            onChange={() => props.onCultivarToggle(c.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div />
        <div>
          <span className={styles.swatch} style={{ background: c.color }} />
        </div>
        <div>{label}</div>
        <div>{CATEGORY_LABELS[c.category]}</div>
        <div style={{ fontStyle: 'italic', opacity: 0.8 }}>{taxonomic}</div>
      </CultivarRow>
    );
  }

  const checkedCount = props.group.children.filter((c) => props.isChecked(c.id)).length;
  const total = props.group.children.length;
  const countLabel = checkedCount === total ? `${total}` : `${checkedCount}/${total}`;
  const taxonomic = getSpecies(props.group.children[0]?.speciesId ?? '')?.taxonomicName ?? '';
  const categories = new Set(props.group.children.map((c) => c.category));
  const categoryLabel = categories.size === 1
    ? CATEGORY_LABELS[[...categories][0]]
    : '';

  return (
    <>
      <div className={styles.speciesRow} onClick={props.onSpeciesExpandToggle}>
        <div className={styles.speciesChevron}>{props.expanded ? '▾' : '▸'}</div>
        <div>
          <input
            ref={triRef}
            type="checkbox"
            checked={props.triState === 'all'}
            onChange={props.onSpeciesToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div />
        <div />
        <div className={styles.speciesName}>
          <span>{props.group.speciesName}</span>
          <span className={styles.speciesCount}>{countLabel}</span>
        </div>
        <div>{categoryLabel}</div>
        <div style={{ fontStyle: 'italic', opacity: 0.8 }}>{taxonomic}</div>
      </div>
      {props.expanded &&
        props.group.children.map((c) => (
          <CultivarRow
            key={c.id}
            cultivar={c}
            getDragPayload={props.getDragPayload}
          >
            <div />
            <div />
            <div>
              <input
                type="checkbox"
                checked={props.isChecked(c.id)}
                onChange={() => props.onCultivarToggle(c.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <span className={styles.swatch} style={{ background: c.color }} />
            </div>
            <div>{c.variety ?? c.name}</div>
            <div />
            <div />
          </CultivarRow>
        ))}
    </>
  );
}

function CultivarRow({
  cultivar,
  getDragPayload,
  children,
}: {
  cultivar: Cultivar;
  getDragPayload: (id: string) => DragPayload;
  children: React.ReactNode;
}) {
  const handle = useDragHandle(() => getDragPayload(cultivar.id));
  return (
    <div
      className={styles.cultivarRow}
      style={handle.style}
      onPointerDown={handle.onPointerDown}
    >
      {children}
    </div>
  );
}
