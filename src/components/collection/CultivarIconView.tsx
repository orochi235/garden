import { useEffect, useMemo, useRef, useState } from 'react';
import { createMarkdownRenderer } from '../../canvas/markdownText';
import { onIconLoad, renderIcon } from '../../canvas/plantRenderers';
import type { Cultivar } from '../../model/cultivars';
import { getSpecies } from '../../model/species';
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  visibleCultivars: Cultivar[];
  isChecked: (id: string) => boolean;
  onCultivarToggle: (id: string) => void;
  onCultivarAdd: (id: string) => void;
  onCultivarDragStart: (id: string, e: React.DragEvent) => void;
  onCultivarDragEnd: () => void;
}

function unwindCommaName(name: string): string {
  const i = name.indexOf(',');
  if (i < 0) return name;
  const head = name.slice(0, i).trim();
  const tail = name.slice(i + 1).trim();
  return tail ? `${tail} ${head}` : head;
}

function darkenHex(hex: string, factor: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `rgb(${r},${g},${b})`;
}

const TILE_W = 144;
const TILE_H = 200;
const ICON_RADIUS = (TILE_H / 2) * 0.8;
const ICON_CY = TILE_H / 2;
const TOP_TEXT_Y = 12;
const BOTTOM_TEXT_BASE = TILE_H - 23;
const FONT_SIZE = 13;
const TEXT_PAD = 8;

function PacketCanvas({ cultivar }: { cultivar: Cultivar }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => onIconLoad(() => setTick((t) => t + 1)), []);

  const rawSpeciesName = getSpecies(cultivar.speciesId)?.name ?? cultivar.name;
  const speciesName = unwindCommaName(rawSpeciesName);
  const variety = cultivar.variety ?? '';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = TILE_W * dpr;
    canvas.height = TILE_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, TILE_W, TILE_H);
    ctx.fillStyle = cultivar.iconBgColor ?? cultivar.color;
    ctx.fillRect(0, 0, TILE_W, TILE_H);
    ctx.textBaseline = 'top';

    ctx.save();
    ctx.translate(TILE_W / 2, ICON_CY);
    renderIcon(ctx, cultivar.id, ICON_RADIUS, cultivar.color);
    ctx.restore();

    const bg = cultivar.iconBgColor ?? cultivar.color;
    const dark = darkenHex(bg, 0.5);

    const upper = speciesName.toUpperCase();
    const target = TILE_W - TEXT_PAD * 2;
    ctx.save();
    ctx.font = '600 14px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const baseWidth = ctx.measureText(upper).width;
    const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    let drawX: number;
    if (upper.length > 1 && baseWidth < target) {
      const extra = (target - baseWidth) / (upper.length - 1);
      const spacing = Math.min(extra, 6);
      ctxAny.letterSpacing = `${spacing}px`;
      const widthWithSpacing = baseWidth + spacing * (upper.length - 1);
      drawX = (TILE_W - widthWithSpacing) / 2;
    } else {
      drawX = (TILE_W - baseWidth) / 2;
    }
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    ctx.shadowColor = dark;
    ctx.shadowBlur = 4;
    ctx.strokeText(upper, drawX, TOP_TEXT_Y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(upper, drawX, TOP_TEXT_Y);
    ctx.restore();

    if (variety) {
      const varietyMd = `*${variety}*`;
      const bot = createMarkdownRenderer(ctx, varietyMd, FONT_SIZE, TILE_W - TEXT_PAD * 2, {
        family: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      });
      const botX = (TILE_W - bot.width) / 2;
      const botY = BOTTOM_TEXT_BASE + (FONT_SIZE - bot.height) / 2;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.shadowColor = dark;
      ctx.shadowBlur = 4;
      bot.strokeRenderer(ctx, varietyMd, botX, botY);
      ctx.shadowBlur = 0;
      bot.renderer(ctx, varietyMd, botX, botY);
      ctx.restore();
    }
  }, [cultivar.id, cultivar.color, cultivar.iconBgColor, speciesName, variety, tick]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.packetCanvas}
      width={TILE_W}
      height={TILE_H}
    />
  );
}

export function CultivarIconView(props: Props) {
  const sorted = useMemo(() => {
    return [...props.visibleCultivars].sort((a, b) => {
      const an = a.variety ?? a.name;
      const bn = b.variety ?? b.name;
      const sa = getSpecies(a.speciesId)?.name ?? '';
      const sb = getSpecies(b.speciesId)?.name ?? '';
      return (sa.localeCompare(sb)) || an.localeCompare(bn);
    });
  }, [props.visibleCultivars]);

  if (sorted.length === 0) {
    return <div className={styles.emptyMessage}>No cultivars match</div>;
  }

  return (
    <div className={styles.iconView}>
      <div className={styles.iconTiles}>
        {sorted.map((c) => {
          const checked = props.isChecked(c.id);
          const speciesName = getSpecies(c.speciesId)?.name ?? c.name;
          const tooltip = c.variety ? `${speciesName} — ${c.variety}` : speciesName;
          return (
            <div
              key={c.id}
              className={`${styles.packet} ${checked ? styles.tileChecked : ''}`}
              style={{ background: c.iconBgColor ?? c.color }}
              draggable
              onDragStart={(e) => props.onCultivarDragStart(c.id, e)}
              onDragEnd={props.onCultivarDragEnd}
              onClick={() => props.onCultivarToggle(c.id)}
              onDoubleClick={() => props.onCultivarAdd(c.id)}
              title={tooltip}
            >
              <PacketCanvas cultivar={c} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
