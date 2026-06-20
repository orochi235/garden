import { registerFont } from '@orochi235/weasel/renderer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import './styles/global.css';

// Register the bundled Inter MSDF atlas as the default `sans-serif` family.
// The GL text pipeline silently drops every glyph when no atlas is registered
// for the requested family/variant, and all of eric's canvas `textCommand`
// sites (tray / structure / zone / planting / seedling / selection labels)
// omit fontFamily → resolve to DEFAULT_TEXT_STYLE ('sans-serif'). Without this
// no canvas label renders at all. publicDir is served under vite's `base`
// (/garden/), so the atlas URLs must carry the BASE_URL prefix or they 404 →
// atlas never loads → labels stay blank. Awaited before first paint so labels
// are present on initial render; `.catch` keeps boot resilient if it fails.
await registerFont(
  'sans-serif',
  { weight: 400, style: 'normal' },
  `${import.meta.env.BASE_URL}fonts/inter/inter.json`,
  `${import.meta.env.BASE_URL}fonts/inter/inter.png`,
).catch((err) => {
  console.warn('failed to register default canvas font; text labels will not render', err);
});

// Dev-only: expose the Zustand stores for headless e2e introspection and
// console debugging. Stripped from production bundles via the DEV guard.
if (import.meta.env.DEV) {
  void Promise.all([import('./store/gardenStore'), import('./store/uiStore')]).then(
    ([garden, ui]) => {
      (window as unknown as Record<string, unknown>).__gardenStore = garden.useGardenStore;
      (window as unknown as Record<string, unknown>).__uiStore = ui.useUiStore;
    },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
