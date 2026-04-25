import { useWorkspaceStore } from './useWorkspaceStore';
import { Workspace } from './Workspace';

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
    resetWorkspace,
    resetAll,
  } = useWorkspaceStore();

  return (
    <div className="dl-root">
      <div className="dl-header">
        <h1>Drag Lab</h1>
        <div className="dl-header-actions">
          <button type="button" onClick={addWorkspace}>+ Add Workspace</button>
          <button type="button" onClick={resetAll} className="dl-danger">Reset All</button>
        </div>
      </div>
      <div className="dl-grid">
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
            onReset={() => resetWorkspace(ws.id)}
            onClose={() => removeWorkspace(ws.id)}
          />
        ))}
      </div>
    </div>
  );
}
