import { useEffect } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

interface CanvasKeyboardDeps {
  clipboard: { copy: () => void; paste: () => void; isEmpty: () => boolean };
  cancelPlotting: () => void;
}

export function useCanvasKeyboard({ clipboard, cancelPlotting }: CanvasKeyboardDeps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useGardenStore.getState().redo();
        } else {
          useGardenStore.getState().undo();
        }
        return;
      }

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        clipboard.copy();
        return;
      }

      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboard.isEmpty()) return;
        e.preventDefault();
        clipboard.paste();
        return;
      }

      if (e.key === 'Escape') {
        cancelPlotting();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
        const ids = useUiStore.getState().selectedIds;
        const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();
        for (const id of ids) {
          if (garden.structures.find((s) => s.id === id)) removeStructure(id);
          else if (garden.zones.find((z) => z.id === id)) removeZone(id);
          else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
        }
        useUiStore.getState().clearSelection();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, cancelPlotting]);
}
