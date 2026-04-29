import { instantiatePreset } from '../model/trayCatalog';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';

/** Switch into seed-starting mode, picking or creating a tray if none is selected. */
export function enterSeedStarting() {
  const ui = useUiStore.getState();
  const garden = useGardenStore.getState().garden;
  const hasCurrent =
    ui.currentTrayId && garden.seedStarting.trays.some((t) => t.id === ui.currentTrayId);
  if (!hasCurrent) {
    if (garden.seedStarting.trays.length > 0) {
      ui.setCurrentTrayId(garden.seedStarting.trays[0].id);
    } else {
      const tray = instantiatePreset('1020-72');
      if (tray) {
        useGardenStore.getState().addTray(tray);
        ui.setCurrentTrayId(tray.id);
      }
    }
  }
  ui.setAppMode('seed-starting');
}
