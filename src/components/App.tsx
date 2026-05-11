import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardActionDispatch } from '../actions/useKeyboardActionDispatch';
import { CanvasNewPrototype } from '../canvas/CanvasNewPrototype';
import { createInsertAdapter } from '../canvas/adapters/insert';
import { asNodeId, useClipboard } from '@orochi235/weasel';
import { useActiveTheme } from '../hooks/useActiveTheme';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/App.module.css';
import { enterSeedStarting } from '../utils/enterSeedStarting';
import { autosave, deserializeGarden, loadPersistedCollection } from '../utils/file';
import type { Cultivar } from '../model/cultivars';
import { WelcomeModal } from './WelcomeModal';
import { ScheduleModal } from './schedule/ScheduleModal';
import { MenuBar } from './MenuBar';
import { ObjectPalette } from './palette/ObjectPalette';
import type { PaletteEntry } from './palette/paletteData';
import { SeedStartingPalette } from './palette/SeedStartingPalette';
import { StatusBar } from './StatusBar';
import { Sidebar } from './sidebar/Sidebar';
import { ViewToolbar } from './ViewToolbar';
import { LayerSelector } from './LayerSelector';
import { loadFixtureFromUrl } from '../dev/fixtureLoader';

const MIN_PANEL = 160;
const MIN_LEFT_PANEL = 200;
const MAX_PANEL = 400;
const DEFAULT_PANEL = 240;

const INITIAL_SEARCH =
  typeof window === 'undefined' ? '' : window.location.search;
const INITIAL_PARAMS = new URLSearchParams(INITIAL_SEARCH);
const INITIAL_MODE_PARAM = INITIAL_PARAMS.get('mode');

export function App() {
  const garden = useGardenStore((s) => s.garden);
  const loadGarden = useGardenStore((s) => s.loadGarden);
  const setCollection = useGardenStore((s) => s.setCollection);
  const appMode = useUiStore((s) => s.appMode);
  const [showWelcome, setShowWelcome] = useState(false);
  const { theme, prevTheme, layerFlip, transitionDuration } = useActiveTheme();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_PANEL);
  const [rightWidth, setRightWidth] = useState(DEFAULT_PANEL);
  const dragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const savedRightWidth = useRef(DEFAULT_PANEL);
  const prevAppMode = useRef(appMode);

  // In production there is no fixture loader, so we're always ready.
  // In dev, hold first render until the fixture check resolves — this
  // prevents the autosave garden from flashing before the fixture hydrates.
  const [fixtureReady, setFixtureReady] = useState<boolean>(import.meta.env.PROD);
  const fixtureLoadedRef = useRef(false);
  useEffect(() => {
    if (import.meta.env.PROD) return;
    loadFixtureFromUrl().then((loaded) => {
      fixtureLoadedRef.current = loaded;
    }).finally(() => setFixtureReady(true));
  }, []);

  useEffect(() => {
    if (prevAppMode.current === appMode) return;
    if (appMode === 'seed-starting') {
      if (rightWidth > 0) savedRightWidth.current = rightWidth;
      setRightWidth(0);
    } else {
      setRightWidth(savedRightWidth.current || DEFAULT_PANEL);
    }
    prevAppMode.current = appMode;
  }, [appMode, rightWidth]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (appMode === 'seed-starting') {
      url.searchParams.set('mode', 'seed-starting');
    } else {
      url.searchParams.delete('mode');
    }
    const next = url.pathname + (url.search ? url.search : '') + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [appMode]);

  useEffect(() => {
    // Skip the autosave/seed restore when a fixture was loaded — the fixture
    // already hydrated the store and we don't want the autosave to overwrite it.
    if (!fixtureReady) return;
    if (fixtureLoadedRef.current) {
      // Still wire up mode param and collection for fixture runs.
      if (INITIAL_MODE_PARAM === 'seed-starting') enterSeedStarting();
      return;
    }

    // The garden store hydrates synchronously from localStorage during
    // its `create()` call (see initialGarden()), so first render already
    // shows the user's persisted garden — no flash. We only need the
    // network seed for first-time visitors with no autosave.
    const hasAutosave =
      typeof window !== 'undefined' &&
      window.localStorage.getItem('garden-planner-autosave') != null;

    const seedPromise = hasAutosave
      ? Promise.resolve()
      : fetch(`${import.meta.env.BASE_URL}default.garden`)
          .then((r) => r.text())
          .then((t) => loadGarden(deserializeGarden(t)))
          .catch(() => {});

    seedPromise.finally(() => {
      if (INITIAL_MODE_PARAM === 'seed-starting') enterSeedStarting();
      const persisted = loadPersistedCollection<Cultivar[]>();
      if (persisted && persisted.length > 0) {
        setCollection(persisted);
      } else if (
        (useGardenStore.getState().garden.collection ?? []).length === 0 &&
        INITIAL_PARAMS.toString() === ''
      ) {
        setShowWelcome(true);
      }
    });
  }, [fixtureReady, loadGarden, setCollection]);

  useEffect(() => {
    autosave(garden);
  }, [garden]);

  const insertAdapter = useMemo(() => createInsertAdapter(), []);
  const clipboard = useClipboard(insertAdapter, {
    getSelection: () => useUiStore.getState().selectedIds.map(asNodeId),
    onPaste: (newIds) => useUiStore.getState().setSelection(newIds),
  });
  const actionCtx = useMemo(() => ({ clipboard }), [clipboard]);
  useKeyboardActionDispatch(actionCtx);

  // Garden palette drag: hand the gesture off to the canvas via a transient
  // ui slot. The garden canvas's `useGardenPaletteDropTool` watches
  // `palettePointerPayload`, owns ghost + threshold drag + commit, and reads
  // the canvas-owned local view (via `viewRef`) for screen→world math. App
  // doesn't read view here.
  const handlePaletteDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      useUiStore.getState().setPalettePointerPayload({
        entry,
        pointerEvent: e.nativeEvent,
      });
    },
    [],
  );

  // Seed-starting palette drag: hand the gesture off to the canvas via a
  // transient ui slot. The canvas's `usePaletteDropTool` watches
  // `palettePointerPayload`, owns ghost + threshold drag + commit, and reads
  // its own local view to compute world coordinates. App doesn't read the
  // canvas's view here.
  const handleSeedDragBegin = useCallback(
    (entry: PaletteEntry, e: React.PointerEvent) => {
      if (entry.category !== 'plantings') return;
      useUiStore.getState().setPalettePointerPayload({
        entry,
        pointerEvent: e.nativeEvent,
      });
    },
    [],
  );

  const handleResizeStart = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = side;
      dragStartX.current = e.clientX;
      dragStartWidth.current = side === 'left' ? leftWidth : rightWidth;
    },
    [leftWidth, rightWidth],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - dragStartX.current;
      const raw = dragging.current === 'left' ? dragStartWidth.current + dx : dragStartWidth.current - dx;
      if (dragging.current === 'left') {
        setLeftWidth(Math.min(MAX_PANEL, Math.max(MIN_LEFT_PANEL, raw)));
      } else {
        // Right sidebar can collapse fully: snap to 0 below MIN_PANEL/2.
        // Cap at DEFAULT_PANEL — the right panel can't grow past its initial size.
        const snapped = raw < MIN_PANEL / 2 ? 0 : Math.min(DEFAULT_PANEL, Math.max(MIN_PANEL, raw));
        if (snapped > 0) savedRightWidth.current = snapped;
        setRightWidth(snapped);
      }
    }

    function handleMouseUp() {
      dragging.current = null;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!fixtureReady) return null;

  const layerATheme = layerFlip ? theme : (prevTheme ?? theme);
  const layerBTheme = layerFlip ? (prevTheme ?? theme) : theme;
  const layerAOpacity = layerFlip ? 1 : 0;
  const layerBOpacity = layerFlip ? 0 : 1;

  return (
    <div
      className={styles.layout}
      style={{
        gridTemplateColumns: `${leftWidth}px 6px 1fr 6px ${rightWidth}px`,
        ['--left-panel-width' as string]: `${leftWidth + 6}px`,
        ['--theme-menu-text' as string]: theme.menuBarText,
        ['--theme-menu-title' as string]: theme.menuBarTitle,
        ['--theme-list-hover' as string]: theme.listHover,
        ['--theme-transition' as string]: `${transitionDuration} ease`,
      }}
    >
      <div
        className={styles.gradientLayer}
        style={{
          background: layerATheme.paletteBackground,
          opacity: layerAOpacity,
          transition: `opacity ${transitionDuration} ease`,
        }}
      />
      <div
        className={styles.gradientLayer}
        style={{
          background: layerBTheme.paletteBackground,
          opacity: layerBOpacity,
          transition: `opacity ${transitionDuration} ease`,
        }}
      />
      <div className={styles.menu}>
        <MenuBar />
      </div>
      <div className={styles.palette}>
        {appMode === 'seed-starting' ? (
          <SeedStartingPalette onDragBegin={handleSeedDragBegin} />
        ) : (
          <ObjectPalette onDragBegin={handlePaletteDragBegin} />
        )}
      </div>
      <div
        className={`${styles.resizeHandle} ${styles.leftHandle}`}
        onMouseDown={(e) => handleResizeStart('left', e)}
      />
      <div className={styles.canvas}>
        <CanvasNewPrototype />
        <ViewToolbar />
        <LayerSelector />
      </div>
      <div
        className={`${styles.resizeHandle} ${styles.rightHandle}`}
        onMouseDown={(e) => handleResizeStart('right', e)}
      />
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.status}>
        <StatusBar />
      </div>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      {useUiStore((s) => s.scheduleOpen) && <ScheduleModal />}
    </div>
  );
}
