import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerId } from '../model/types';
import { useUiStore } from '../store/uiStore';
import styles from '../styles/LayerSelector.module.css';

interface LayerDef {
  id: LayerId;
  label: string;
  color: string;
  dark: string;
  side1: string;
  side2: string;
  stroke: string;
}

const LAYERS: LayerDef[] = [
  {
    id: 'plantings',
    label: 'Plantings',
    color: '#4A7C59',
    dark: '#3a6a48',
    side1: '#3f6d4e',
    side2: '#356042',
    stroke: '#3a6a48',
  },
  {
    id: 'zones',
    label: 'Zones',
    color: '#7FB069',
    dark: '#5c8a4a',
    side1: '#6a9a56',
    side2: '#5c8a4a',
    stroke: '#6a9a56',
  },
  {
    id: 'structures',
    label: 'Structures',
    color: '#D4A843',
    dark: '#a8832a',
    side1: '#c09530',
    side2: '#a8832a',
    stroke: '#b8942e',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    color: '#4A7CAF',
    dark: '#35608a',
    side1: '#3f6d9a',
    side2: '#35608a',
    stroke: '#3a6a9a',
  },
  {
    id: 'ground',
    label: 'Ground',
    color: '#8B7355',
    dark: '#6b5540',
    side1: '#7a6349',
    side2: '#6b5540',
    stroke: '#6b5a42',
  },
];

// Tight preset parameters
const HALF_W = 30;
const PLATE_GAP_DEG = 5;
const ARC_CURVE_PCT = 0.8;
const CAMERA_ANGLE_DEG = 4;
const ENDCAP_BIAS = 0.4;
const SIDE_THICK = 1.5;
const TILE_OPACITY = 0.85;
const SHADOW_BLUR = 2;
const SHADOW_OFF = 2;
const SHADOW_ALPHA = 0.5;
const ANIM_DUR = 250;
const CAM_FOLLOW = 0.0;

interface TileState {
  index: number;
  y: number;
  tilt: number;
  dir: number;
  dist: number;
  viewAngle: number;
  z: number;
}

function computeLayout(activeIdx: number): TileState[] {
  const n = LAYERS.length;
  const centerY = 55;
  const camRad = (CAMERA_ANGLE_DEG * Math.PI) / 180;
  const gapRad = (PLATE_GAP_DEG * Math.PI) / 180;
  const arcR = ARC_CURVE_PCT > 0.01 ? (HALF_W * 3) / ARC_CURVE_PCT : 100000;

  const tiles: TileState[] = [];

  for (let i = 0; i < n; i++) {
    const rel = i - activeIdx;
    const absDist = Math.abs(rel);
    const arcAngle = rel * gapRad;
    const y3d = arcR * Math.sin(arcAngle);
    const z3d = arcR * (1 - Math.cos(arcAngle));

    const distToEdge = Math.min(i, n - 1 - i);
    const maxDistToEdge = Math.floor((n - 1) / 2);
    const extremeness = maxDistToEdge > 0 ? 1 - distToEdge / maxDistToEdge : 1;
    const endcapExtra = extremeness * ENDCAP_BIAS * gapRad;
    const plateTilt = arcAngle * ARC_CURVE_PCT + Math.sign(rel) * endcapExtra;

    const screenY = centerY + y3d * Math.cos(camRad) + z3d * Math.sin(camRad);
    const viewAngle = Math.abs(plateTilt) + camRad;
    const tiltY = Math.max(0.5, HALF_W * Math.sin(Math.min(viewAngle, Math.PI / 2)));
    const dir = rel === 0 ? (camRad > 0 ? 1 : 0) : rel > 0 ? 1 : -1;

    tiles[i] = { index: i, y: screenY, tilt: tiltY, dir, dist: absDist, viewAngle, z: z3d };
  }

  // Normalize positions
  const margin = 8;
  const topTile = tiles.reduce((a, b) => (a.y - a.tilt < b.y - b.tilt ? a : b));
  const botTile = tiles.reduce((a, b) => (a.y + a.tilt > b.y + b.tilt ? a : b));
  const posSpan = botTile.y - topTile.y || 1;
  const tiltOverhead = topTile.tilt + botTile.tilt;
  const targetSpan = 110 - 2 * margin;
  const scale = Math.min(1, (targetSpan - tiltOverhead) / posSpan);
  const posMid = (topTile.y + botTile.y) / 2;
  const activeY = tiles[activeIdx].y;
  const anchor = posMid + (activeY - posMid) * CAM_FOLLOW;
  for (const t of tiles) {
    t.y = centerY + (t.y - anchor) * scale;
  }

  return tiles;
}

function applyEasing(rawT: number): number {
  return 1 - (1 - rawT) ** 3; // ease-out
}

function interpolateLayouts(from: TileState[], to: TileState[], t: number): TileState[] {
  return from.map((old, i) => ({
    index: i,
    y: old.y + (to[i].y - old.y) * t,
    tilt: old.tilt + (to[i].tilt - old.tilt) * t,
    dir: to[i].dir,
    dist: to[i].dist,
    viewAngle: old.viewAngle + (to[i].viewAngle - old.viewAngle) * t,
    z: old.z + (to[i].z - old.z) * t,
  }));
}

function renderSvgContent(tileStates: TileState[], activeIdx: number): string {
  const labelSpace = 58;
  const svgW = HALF_W * 2 + labelSpace + 10;
  const cx = labelSpace + HALF_W;

  // Compute tight vertical bounds
  const margin = 6;
  const sideThick = SIDE_THICK;
  let minY = Infinity,
    maxY = -Infinity;
  for (const t of tileStates) {
    minY = Math.min(minY, t.y - t.tilt - sideThick);
    maxY = Math.max(maxY, t.y + t.tilt + sideThick);
  }
  const svgH = maxY - minY + margin * 2;
  const yOffset = -minY + margin;

  const sorted = [...tileStates].sort((a, b) => {
    if (a.index === activeIdx) return 1;
    if (b.index === activeIdx) return -1;
    return (b.z ?? b.dist) - (a.z ?? a.dist);
  });

  let defs = '';
  let content = '';

  // Shadow filters
  for (let i = 0; i < LAYERS.length; i++) {
    const t = tileStates[i];
    const sDir = t.dir <= 0 ? -1 : 1;
    const angleFactor = Math.max(0.3, 1 - Math.sin(t.viewAngle) * 0.5);
    defs += `<filter id="sh${i}" x="-30%" y="-40%" width="160%" height="200%">
      <feDropShadow dx="0" dy="${sDir * SHADOW_OFF * angleFactor}" stdDeviation="${SHADOW_BLUR * angleFactor}" flood-color="#000" flood-opacity="${SHADOW_ALPHA}"/>
    </filter>`;
  }

  // Clip paths (no clipping in tight preset by default)
  for (let i = 0; i < LAYERS.length; i++) {
    if (i === activeIdx) continue;
    defs += `<clipPath id="clip${i}"><rect x="-200" y="-200" width="800" height="1000"/></clipPath>`;
  }

  for (const t of sorted) {
    const layer = LAYERS[t.index];
    const isActive = t.index === activeIdx;
    const tiltY = t.tilt;
    const opacity = isActive ? 0.95 : TILE_OPACITY;
    const baseThick = SIDE_THICK;
    const thickScale = Math.cos(Math.min(t.viewAngle, Math.PI / 2));
    const thick = baseThick * Math.max(0.1, thickScale);

    const filterAttr = `filter="url(#sh${t.index})"`;

    if (!isActive) {
      content += `<g ${filterAttr}>`;
      content += `<g clip-path="url(#clip${t.index})">`;
      content += `<g transform="translate(${cx},${t.y + yOffset})" style="filter:saturate(0.25)" data-idx="${t.index}" class="tile">`;
    } else {
      content += `<g transform="translate(${cx},${t.y + yOffset})" ${filterAttr} data-idx="${t.index}" class="tile">`;
    }

    const fillAttr = layer.color;

    if (tiltY < 0.3) {
      content += `<line x1="${-HALF_W}" y1="0" x2="${HALF_W}" y2="0" stroke="${layer.stroke}" stroke-width="0.5"/>`;
    } else {
      const topPts = `0,${-tiltY} ${HALF_W},0 0,${tiltY} ${-HALF_W},0`;

      if (thick > 0) {
        if (t.dir < 0) {
          content += `<polygon points="0,${-tiltY} ${HALF_W},0 ${HALF_W},${-thick} 0,${-tiltY - thick}" fill="${layer.side1}" opacity="${opacity}" stroke="none"/>`;
          content += `<polygon points="0,${-tiltY} ${-HALF_W},0 ${-HALF_W},${-thick} 0,${-tiltY - thick}" fill="${layer.side2}" opacity="${opacity}" stroke="none"/>`;
        } else {
          content += `<polygon points="0,${tiltY} ${HALF_W},0 ${HALF_W},${thick} 0,${tiltY + thick}" fill="${layer.side1}" opacity="${opacity}" stroke="none"/>`;
          content += `<polygon points="0,${tiltY} ${-HALF_W},0 ${-HALF_W},${thick} 0,${tiltY + thick}" fill="${layer.side2}" opacity="${opacity}" stroke="none"/>`;
        }
      }

      content += `<polygon points="${topPts}" fill="${fillAttr}" opacity="${opacity}" stroke="none"/>`;
    }

    content += `</g>`;
    if (!isActive) {
      content += `</g></g>`;
    }

    if (isActive) {
      content += `<text x="${cx - HALF_W - 6}" y="${t.y + yOffset + 3}" text-anchor="end" fill="#ccc" font-size="9" font-weight="600">${layer.label}</text>`;
    }
  }

  return `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="overflow:visible">
    <defs>${defs}</defs>${content}</svg>`;
}

export function LayerSelector() {
  const activeLayer = useUiStore((s) => s.activeLayer);
  const setActiveLayer = useUiStore((s) => s.setActiveLayer);
  const [svgHtml, setSvgHtml] = useState('');
  const animRef = useRef<number | null>(null);
  const layoutRef = useRef<TileState[] | null>(null);

  const renderWidget = useCallback((tiles: TileState[], idx: number) => {
    setSvgHtml(renderSvgContent(tiles, idx));
    layoutRef.current = tiles;
  }, []);

  // Initial render and animate on activeLayer change
  useEffect(() => {
    const newIdx = LAYERS.findIndex((l) => l.id === activeLayer);
    const newLayout = computeLayout(newIdx);

    if (!layoutRef.current) {
      renderWidget(newLayout, newIdx);
      return;
    }

    const oldLayout = layoutRef.current;
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const startTime = performance.now();

    function animFrame(now: number) {
      const rawT = Math.min((now - startTime) / ANIM_DUR, 1);
      const t = applyEasing(rawT);
      const interp = interpolateLayouts(oldLayout, newLayout, t);
      renderWidget(interp, newIdx);
      if (rawT < 1) {
        animRef.current = requestAnimationFrame(animFrame);
      } else {
        animRef.current = null;
      }
    }

    animRef.current = requestAnimationFrame(animFrame);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [activeLayer, renderWidget]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const tile = (e.target as Element).closest('.tile');
      if (!tile) return;
      const idx = parseInt(tile.getAttribute('data-idx') ?? '', 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < LAYERS.length) {
        setActiveLayer(LAYERS[idx].id);
      }
    },
    [setActiveLayer],
  );

  const lastWheelTime = useRef(0);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastWheelTime.current < 300) return;
      lastWheelTime.current = now;
      const idx = LAYERS.findIndex((l) => l.id === activeLayer);
      if (e.deltaY > 0) {
        setActiveLayer(LAYERS[(idx + 1) % LAYERS.length].id);
      } else if (e.deltaY < 0) {
        setActiveLayer(LAYERS[(idx - 1 + LAYERS.length) % LAYERS.length].id);
      }
    },
    [activeLayer, setActiveLayer],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'SELECT'
      )
        return;
      e.preventDefault();
      const current = useUiStore.getState().activeLayer;
      const idx = LAYERS.findIndex((l) => l.id === current);
      const next =
        e.key === 'ArrowDown'
          ? (idx + 1) % LAYERS.length
          : (idx - 1 + LAYERS.length) % LAYERS.length;
      useUiStore.getState().setActiveLayer(LAYERS[next].id);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={styles.container}
      onClick={handleClick}
      onWheel={handleWheel}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
