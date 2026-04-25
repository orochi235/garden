import { getCultivar } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import f from '../../styles/PropertiesPanel.module.css';
import s from '../../styles/SelectionPanel.module.css';

interface TreeItem {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
}

interface TreeNode {
  parent: TreeItem;
  children: TreeItem[];
}

export function SelectionPanel() {
  const garden = useGardenStore((g) => g.garden);
  const selectedIds = useUiStore((u) => u.selectedIds);
  const select = useUiStore((u) => u.select);
  const selectedSet = new Set(selectedIds);

  // Build hierarchy: containers/zones as parents, plantings as children
  const nodes: TreeNode[] = [];
  const orphanPlantings: TreeItem[] = [];

  // Build a map of parent ID → selected plantings under it
  const plantingsByParent = new Map<string, TreeItem[]>();
  for (const p of garden.plantings) {
    if (!selectedSet.has(p.id)) continue;
    const cultivar = getCultivar(p.cultivarId);
    const item: TreeItem = {
      id: p.id,
      label: cultivar?.name ?? p.cultivarId,
      sublabel: cultivar?.variety ?? undefined,
      color: cultivar?.color ?? '#4A7C59',
    };
    const group = plantingsByParent.get(p.parentId) ?? [];
    group.push(item);
    plantingsByParent.set(p.parentId, group);
  }

  // Structures — show as parent nodes if they're containers with selected children,
  // or as leaf items if the structure itself is selected
  for (const st of garden.structures) {
    const selfSelected = selectedSet.has(st.id);
    const children = plantingsByParent.get(st.id);
    if (!selfSelected && !children) continue;

    const parent: TreeItem = {
      id: st.id,
      label: st.label || st.type,
      sublabel: st.label ? st.type : undefined,
      color: st.color,
    };
    nodes.push({ parent, children: children ?? [] });
    plantingsByParent.delete(st.id);
  }

  // Zones — same logic
  for (const z of garden.zones) {
    const selfSelected = selectedSet.has(z.id);
    const children = plantingsByParent.get(z.id);
    if (!selfSelected && !children) continue;

    const parent: TreeItem = {
      id: z.id,
      label: z.label || 'zone',
      color: z.color,
    };
    nodes.push({ parent, children: children ?? [] });
    plantingsByParent.delete(z.id);
  }

  // Any plantings whose parent wasn't itself selected or listed
  for (const items of plantingsByParent.values()) {
    orphanPlantings.push(...items);
  }

  return (
    <div className={f.panel}>
      <div className={f.title}>Selection</div>
      <div className={s.tree}>
        {nodes.map((node) => (
          <div key={node.parent.id} className={s.group}>
            <button
              className={`${s.item} ${s.parentItem} ${selectedSet.has(node.parent.id) ? '' : s.dimParent}`}
              onClick={() => select(node.parent.id)}
              title="Click to inspect"
            >
              <span className={s.swatch} style={{ background: node.parent.color }} />
              <span className={s.itemLabel}>{node.parent.label}</span>
              {node.parent.sublabel && (
                <span className={s.itemSublabel}>{node.parent.sublabel}</span>
              )}
            </button>
            {node.children.map((child) => (
              <button
                key={child.id}
                className={s.item}
                onClick={() => select(child.id)}
                title="Click to inspect"
              >
                <span className={s.swatch} style={{ background: child.color }} />
                <span className={s.itemLabel}>{child.label}</span>
                {child.sublabel && (
                  <span className={s.itemSublabel}>{child.sublabel}</span>
                )}
              </button>
            ))}
          </div>
        ))}
        {orphanPlantings.length > 0 && (
          <div className={s.group}>
            {orphanPlantings.map((item) => (
              <button
                key={item.id}
                className={s.item}
                onClick={() => select(item.id)}
                title="Click to inspect"
              >
                <span className={s.swatch} style={{ background: item.color }} />
                <span className={s.itemLabel}>{item.label}</span>
                {item.sublabel && (
                  <span className={s.itemSublabel}>{item.sublabel}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
