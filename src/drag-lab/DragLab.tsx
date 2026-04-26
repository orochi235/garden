import { useMemo } from 'react';
import { useWorkspaceStore } from './useWorkspaceStore';
import { Workspace } from './Workspace';

function gridDims(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function DragLab() {
  const {
    workspaces,
    saves,
    addWorkspace,
    removeWorkspace,
    updateWorkspace,
    setStrategy,
    setConfig,
    addItem,
    removeItem,
    setContainerSize,
    setContainerShape,
    saveState,
    loadState,
    cloneWorkspace,
    resetWorkspace,
    resetAll,
    undo,
    redo,
  } = useWorkspaceStore();

  const dims = useMemo(() => gridDims(workspaces.length), [workspaces.length]);

  return (
    <div className="dl-root">
      <div className="dl-header">
        <h1>Drag Lab</h1>
        <div className="dl-header-actions">
          <button type="button" onClick={addWorkspace}>+ Add Workspace</button>
          <button type="button" onClick={resetAll} className="dl-danger">Reset All</button>
        </div>
      </div>
      <div className="dl-grid" style={{ '--dl-cols': dims.cols, '--dl-rows': dims.rows } as React.CSSProperties}>
        {workspaces.map((ws) => (
          <Workspace
            key={ws.id}
            state={ws}
            saves={saves}
            onUpdate={(patch) => updateWorkspace(ws.id, patch)}
            onSetStrategy={(name) => setStrategy(ws.id, name)}
            onSetConfig={(key, value) => setConfig(ws.id, key, value)}
            onAddItem={(item) => addItem(ws.id, item)}
            onRemoveItem={(itemId) => removeItem(ws.id, itemId)}
            onSetContainerSize={(w, h) => setContainerSize(ws.id, w, h)}
            onSetContainerShape={(shape) => setContainerShape(ws.id, shape)}
            onSave={(name) => saveState(ws.id, name)}
            onLoad={(save) => loadState(ws.id, save)}
            onClone={() => cloneWorkspace(ws.id)}
            onReset={() => resetWorkspace(ws.id)}
            onClose={() => removeWorkspace(ws.id)}
            onUndo={() => undo(ws.id)}
            onRedo={() => redo(ws.id)}
          />
        ))}
      </div>
    </div>
  );
}
