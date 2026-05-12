import type { Cultivar } from '../../../model/cultivars';
import type { ResolvedAction } from '../../../model/scheduler';

export type ColorEncoding = 'by-action' | 'by-plant' | 'by-urgency' | 'mono';

export interface ColorInputs {
  action: ResolvedAction;
  cultivar: Cultivar | null;
  today: string;
}

export interface BarColor {
  bg: string;
  fg: string;
}

const MONO: BarColor = { bg: '#4A7C59', fg: '#ffffff' };
const NEUTRAL: BarColor = { bg: '#4a4a4a', fg: '#dddddd' };

const ACTION_COLORS: Record<string, BarColor> = {
  sow: { bg: '#4A7C59', fg: '#ffffff' },
  'harden-off': { bg: '#7A9F87', fg: '#1a1a1a' },
  transplant: { bg: '#6a8fb4', fg: '#ffffff' },
  water: { bg: '#c5a44e', fg: '#1a1a1a' },
  'water-feed': { bg: '#c5a44e', fg: '#1a1a1a' },
  prune: { bg: '#a16f99', fg: '#ffffff' },
  pinch: { bg: '#a16f99', fg: '#ffffff' },
  harvest: { bg: '#b8825e', fg: '#ffffff' },
};

const URGENCY_OVERDUE: BarColor = { bg: '#c54a4a', fg: '#ffffff' };
const URGENCY_TODAY: BarColor = { bg: '#c5a44e', fg: '#1a1a1a' };
const URGENCY_WINDOW: BarColor = { bg: '#4A7C59', fg: '#ffffff' };
const URGENCY_FUTURE: BarColor = { bg: '#4a4a4a', fg: '#dddddd' };

export function barColor(encoding: ColorEncoding, inputs: ColorInputs): BarColor {
  switch (encoding) {
    case 'by-action':
      return ACTION_COLORS[inputs.action.actionId] ?? NEUTRAL;
    case 'by-plant': {
      const c = inputs.cultivar?.color;
      if (!c) return NEUTRAL;
      return { bg: c, fg: pickContrast(c) };
    }
    case 'by-urgency': {
      const { earliest, latest } = inputs.action;
      const t = inputs.today;
      if (latest < t) return URGENCY_OVERDUE;
      if (earliest <= t && t <= latest) return URGENCY_TODAY;
      if (earliest > t) return URGENCY_FUTURE;
      return URGENCY_WINDOW;
    }
    case 'mono':
      return MONO;
    default:
      return MONO;
  }
}

function pickContrast(hex: string): '#1a1a1a' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}
