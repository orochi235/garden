import { instantiatePreset } from '../model/trayCatalog';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';

/** Switch into nursery mode, picking or creating a tray if none is selected. */
export function enterNursery() {
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  const hasCurrent =
    ui.currentTrayId && garden.nursery.trays.some((t) => t.id === ui.currentTrayId);
  if (!hasCurrent) {
    if (garden.nursery.trays.length > 0) {
      ui.setCurrentTrayId(garden.nursery.trays[0].id);
    } else {
      const tray = instantiatePreset('1020-72');
      if (tray) {
        useGardenStore.getState().addTraySilent(tray);
        ui.setCurrentTrayId(tray.id);
      }
    }
  }
  if (ui.activeLayer !== 'plantings' && ui.activeLayer !== 'zones') {
    ui.setActiveLayer('plantings');
  }
  ui.setAppMode('nursery');
}
