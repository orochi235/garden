import { useEffect, useRef } from 'react';
import type { Cultivar } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import styles from '../../styles/CollectionEditor.module.css';
import type { TriState } from '../../hooks/useCollectionEditorState';
import { CultivarRow } from './CultivarRow';

interface Props {
  speciesId: string;
  visibleChildren: Cultivar[];
  expanded: boolean;
  triState: TriState;
  isChecked: (id: string) => boolean;
  onSpeciesToggle: () => void;
  onSpeciesExpandToggle: () => void;
  onCultivarToggle: (id: string) => void;
  onCultivarDragStart: (id: string, e: React.DragEvent) => void;
  onCultivarDragEnd: () => void;
}

export function SpeciesGroup(props: Props) {
  const species = getSpecies(props.speciesId);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.triState === 'some';
  }, [props.triState]);

  const childrenCount = props.visibleChildren.length;
  const checkedCount = props.visibleChildren.filter((c) => props.isChecked(c.id)).length;
  const countLabel = checkedCount === childrenCount ? `${childrenCount}` : `${checkedCount}/${childrenCount}`;

  return (
    <div className={styles.speciesGroup}>
      <div className={styles.speciesRow}>
        <span className={styles.speciesChevron} onClick={props.onSpeciesExpandToggle}>
          {props.expanded ? '▾' : '▸'}
        </span>
        <input
          ref={ref}
          type="checkbox"
          checked={props.triState === 'all'}
          onChange={props.onSpeciesToggle}
        />
        <span style={{ flex: 1 }} onClick={props.onSpeciesExpandToggle}>{species?.name ?? props.speciesId}</span>
        <span style={{ opacity: 0.6 }}>{countLabel}</span>
      </div>
      {props.expanded &&
        props.visibleChildren.map((c) => (
          <CultivarRow
            key={c.id}
            cultivar={c}
            checked={props.isChecked(c.id)}
            onToggle={() => props.onCultivarToggle(c.id)}
            onDragStart={(e) => props.onCultivarDragStart(c.id, e)}
            onDragEnd={props.onCultivarDragEnd}
          />
        ))}
    </div>
  );
}
