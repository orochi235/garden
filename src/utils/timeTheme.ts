/** Time-of-day palette themes for the sidebar gradient and menu bar. */

export interface TimeTheme {
  /** CSS background (layered gradients) for the palette panel */
  paletteBackground: string;
  /** Solid color for search bar overlay */
  searchOverlay: string;
  /** Menu bar background */
  menuBarBg: string;
  /** Menu bar title color */
  menuBarTitle: string;
  /** Menu bar text color */
  menuBarText: string;
  /** Hover highlight for list rows */
  listHover: string;
}

const night: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #5A5560 50%,
      #4E4E5E 58%, #4A4A5E 65%, #3E4260 72%, #343A58 80%,
      #2A3450 90%, #1A2744 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(107,78,42,0.25) 32%, rgba(90,107,58,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(60,65,80,0.3) 0%, transparent 25%, transparent 65%, rgba(42,52,80,0.2) 85%, transparent 100%)`,
  searchOverlay: 'rgba(26, 39, 68, 0.85)',
  menuBarBg: '#1A2744',
  menuBarTitle: '#E8D08C',
  menuBarText: '#D4B870',
  listHover: 'rgba(212, 184, 112, 0.12)',
};

const midnight: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #1A1A1E 0%, #252228 3%, #3A2820 8%, #4A3620 12%,
      #3A4828 16%, #2E5530 19%, #325A34 22%, #4A6038 25%,
      #5A5840 30%, #524A40 35%, #484040 42%, #3A3840 50%,
      #333340 58%, #2E2E40 65%, #282E48 72%, #222840 80%,
      #1C2238 90%, #101828 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(74,54,32,0.2) 32%, rgba(60,74,40,0.15) 42%, transparent 55%),
    linear-gradient(195deg, rgba(40,44,56,0.3) 0%, transparent 25%, transparent 65%, rgba(28,34,56,0.2) 85%, transparent 100%)`,
  searchOverlay: 'rgba(16, 24, 40, 0.9)',
  menuBarBg: '#101828',
  menuBarTitle: '#B8A870',
  menuBarText: '#9A8E6A',
  listHover: 'rgba(154, 142, 106, 0.12)',
};

const sunrise: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2E2A2A 0%, #3E3432 3%, #6A4530 8%, #7A5828 12%,
      #688038 16%, #558A40 19%, #5A9648 22%, #78A050 25%,
      #9A9058 30%, #857858 35%, #6A6058 42%, #6E5848 50%,
      #8E604A 58%, #A8684A 65%, #C47848 72%, #D48850 80%,
      #E09860 90%, #E8A868 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(140,90,40,0.3) 32%, rgba(120,100,50,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(80,55,40,0.25) 0%, transparent 25%, transparent 65%, rgba(180,100,50,0.15) 85%, transparent 100%)`,
  searchOverlay: 'rgba(200, 140, 80, 0.75)',
  menuBarBg: '#E8A868',
  menuBarTitle: '#4A2810',
  menuBarText: '#5C3418',
  listHover: 'rgba(232, 168, 104, 0.15)',
};

const morning: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #302C28 0%, #403830 3%, #704828 8%, #806020 12%,
      #6A8830 16%, #509428 19%, #54A040 22%, #78AC48 25%,
      #9C9850 30%, #888060 35%, #6A6058 42%, #748068 50%,
      #7A9070 58%, #80A078 65%, #78B0A0 72%, #70B8C0 80%,
      #68C0D8 90%, #60C8E8 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(120,100,50,0.2) 32%, rgba(100,130,60,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(70,85,100,0.2) 0%, transparent 25%, transparent 65%, rgba(80,140,180,0.1) 85%, transparent 100%)`,
  searchOverlay: 'rgba(80, 170, 210, 0.8)',
  menuBarBg: '#60C8E8',
  menuBarTitle: '#1A3040',
  menuBarText: '#204050',
  listHover: 'rgba(96, 200, 232, 0.12)',
};

const noon: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #322E28 0%, #443A2E 3%, #785020 8%, #8A681A 12%,
      #5C9428 16%, #40A822 19%, #44B438 22%, #68B840 25%,
      #90A840 30%, #888060 35%, #6A6058 42%, #688060 50%,
      #6A9468 58%, #68A87A 65%, #60B8A0 72%, #58C0C0 80%,
      #50C0D8 90%, #48C0E0 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(120,100,40,0.25) 32%, rgba(80,140,50,0.25) 42%, transparent 55%),
    linear-gradient(195deg, rgba(60,80,100,0.2) 0%, transparent 25%, transparent 65%, rgba(60,140,170,0.12) 85%, transparent 100%)`,
  searchOverlay: 'rgba(60, 160, 190, 0.8)',
  menuBarBg: '#48C0E0',
  menuBarTitle: '#1A3038',
  menuBarText: '#1E3848',
  listHover: 'rgba(72, 192, 224, 0.12)',
};

const afternoon: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #322E28 0%, #443A2E 3%, #785020 8%, #8A681A 12%,
      #709428 16%, #4CA020 19%, #50AC38 22%, #80B840 25%,
      #A8A048 30%, #908860 35%, #706858 42%, #687078 50%,
      #607888 58%, #588898 65%, #5090A8 72%, #4898B8 80%,
      #50A0C0 90%, #58A8C8 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(107,88,42,0.2) 32%, rgba(90,100,80,0.15) 42%, transparent 55%),
    linear-gradient(195deg, rgba(60,75,100,0.25) 0%, transparent 25%, transparent 65%, rgba(60,110,140,0.15) 85%, transparent 100%)`,
  searchOverlay: 'rgba(70, 130, 160, 0.8)',
  menuBarBg: '#58A8C8',
  menuBarTitle: '#1A3040',
  menuBarText: '#1E3848',
  listHover: 'rgba(88, 168, 200, 0.12)',
};

const sunset: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2E2A2A 0%, #3E3432 3%, #6A4530 8%, #7A5828 12%,
      #648038 16%, #508840 19%, #559448 22%, #72984A 25%,
      #968C58 30%, #807058 35%, #6A6058 42%, #7A5848 50%,
      #9A5840 58%, #B85838 65%, #C85840 72%, #C04858 80%,
      #A04870 90%, #804878 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(140,80,40,0.25) 32%, rgba(120,90,50,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(80,50,60,0.25) 0%, transparent 25%, transparent 65%, rgba(140,60,100,0.15) 85%, transparent 100%)`,
  searchOverlay: 'rgba(128, 72, 120, 0.85)',
  menuBarBg: '#804878',
  menuBarTitle: '#F0D0E0',
  menuBarText: '#E0B8D0',
  listHover: 'rgba(224, 184, 208, 0.12)',
};

const twilight: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #5E5058 50%,
      #5A4858 58%, #5C4260 65%, #5E3E68 72%, #5A3870 80%,
      #4E3470 90%, #3E2E60 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(100,70,42,0.25) 32%, rgba(80,90,58,0.18) 42%, transparent 55%),
    linear-gradient(195deg, rgba(70,50,80,0.3) 0%, transparent 25%, transparent 65%, rgba(60,40,90,0.2) 85%, transparent 100%)`,
  searchOverlay: 'rgba(62, 46, 96, 0.85)',
  menuBarBg: '#3E2E60',
  menuBarTitle: '#D8C0E0',
  menuBarText: '#C0A8D0',
  listHover: 'rgba(192, 168, 208, 0.12)',
};

const basement: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A1B0E 0%, #6B4A28 4%, #5C3E22 9%, #44321E 15%,
      #3A2A28 22%, #34302E 30%, #3A3D40 40%, #404852 50%,
      #444C56 60%, #485058 70%, #6E8090 80%, #A8C0D0 90%, #ECF4F8 100%
    ),
    radial-gradient(ellipse 60% 4% at 10% 72%, rgba(255, 255, 245, 0.85) 0%, rgba(235, 245, 225, 0.55) 20%, rgba(200, 220, 200, 0.25) 50%, transparent 85%),
    linear-gradient(to top,
      transparent 0%,
      transparent calc(40% - 62px),
      rgba(0, 0, 0, 0.95) 40%,
      transparent calc(40% + 62px),
      transparent 100%
    ),
    radial-gradient(ellipse 35% 14% at 22% 100%, rgba(225, 240, 225, 0.28) 0%, transparent 65%),
    radial-gradient(ellipse 35% 14% at 78% 100%, rgba(225, 240, 225, 0.28) 0%, transparent 65%),
    linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 22%)`,
  searchOverlay: 'rgba(30, 31, 30, 0.9)',
  menuBarBg: 'transparent',
  menuBarTitle: '#1A2230',
  menuBarText: '#2A3340',
  listHover: 'rgba(20, 30, 40, 0.22)',
};

const cellar: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #14080A 0%, #2E1F12 4%, #281A0F 9%, #1F160E 15%,
      #1C1410 22%, #1A1614 30%, #181A1C 40%, #14161A 50%,
      #10131A 60%, #0C0E14 70%, #232B36 80%, #05060A 90%, #03040A 100%
    ),
    radial-gradient(ellipse 60% 4% at 10% 72%, rgba(255, 255, 245, 0.85) 0%, rgba(235, 245, 225, 0.55) 20%, rgba(200, 220, 200, 0.25) 50%, transparent 85%),
    linear-gradient(to top,
      transparent 0%,
      transparent calc(40% - 62px),
      rgba(0, 0, 0, 0.95) 40%,
      transparent calc(40% + 62px),
      transparent 100%
    ),
    radial-gradient(ellipse 35% 14% at 22% 100%, rgba(225, 240, 225, 0.28) 0%, transparent 65%),
    radial-gradient(ellipse 35% 14% at 78% 100%, rgba(225, 240, 225, 0.28) 0%, transparent 65%),
    linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 22%)`,
  searchOverlay: 'rgba(30, 31, 30, 0.9)',
  menuBarBg: 'transparent',
  menuBarTitle: '#E8EEF4',
  menuBarText: '#C0C8D0',
  listHover: 'rgba(255, 255, 255, 0.10)',
};

const themes = { sunrise, morning, noon, afternoon, sunset, twilight, night, midnight, basement, cellar };

export type TimePeriod = keyof typeof themes;

export function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 7) return 'sunrise';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 13) return 'noon';
  if (hour >= 13 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 18) return 'sunset';
  if (hour >= 18 && hour < 20) return 'twilight';
  if (hour >= 20 && hour < 24) return 'night';
  return 'midnight'; // 0–4
}

export function getCurrentTheme(): TimeTheme {
  return themes[getTimePeriod(new Date().getHours())];
}

export function getTheme(period: TimePeriod): TimeTheme {
  return themes[period];
}

/** Themes shown in the debug palette. */
export const ALL_PERIODS: TimePeriod[] = [
  'sunrise',
  'morning',
  'noon',
  'afternoon',
  'sunset',
  'twilight',
  'night',
  'midnight',
  'basement',
  'cellar',
];

/** Day/night themes used by the auto-cycle override (excludes basement variants). */
export const CYCLE_PERIODS: TimePeriod[] = [
  'sunrise',
  'morning',
  'noon',
  'afternoon',
  'sunset',
  'twilight',
  'night',
  'midnight',
];

