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
    linear-gradient(195deg, rgba(60,65,80,0.3) 0%, transparent 25%, transparent 65%, rgba(42,52,80,0.2) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(61,122,58,0.25) 0%, transparent 70%),
    radial-gradient(ellipse 80% 10% at 60% 58%, rgba(138,132,96,0.2) 0%, transparent 70%)`,
  searchOverlay: 'rgba(26, 39, 68, 0.85)',
  menuBarBg: '#1A2744',
  menuBarTitle: '#E8D08C',
  menuBarText: '#D4B870',
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
    linear-gradient(195deg, rgba(40,44,56,0.3) 0%, transparent 25%, transparent 65%, rgba(28,34,56,0.2) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(40,80,38,0.2) 0%, transparent 70%),
    radial-gradient(ellipse 80% 10% at 60% 58%, rgba(90,86,62,0.15) 0%, transparent 70%)`,
  searchOverlay: 'rgba(16, 24, 40, 0.9)',
  menuBarBg: '#101828',
  menuBarTitle: '#B8A870',
  menuBarText: '#9A8E6A',
};

const sunrise: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #6E5848 50%,
      #8E604A 58%, #A8684A 65%, #C47848 72%, #D48850 80%,
      #E09860 90%, #E8A868 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(140,90,40,0.3) 32%, rgba(120,100,50,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(80,55,40,0.25) 0%, transparent 25%, transparent 65%, rgba(180,100,50,0.15) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(80,130,50,0.25) 0%, transparent 70%),
    radial-gradient(ellipse 100% 25% at 50% 85%, rgba(230,140,60,0.25) 0%, transparent 70%)`,
  searchOverlay: 'rgba(200, 140, 80, 0.75)',
  menuBarBg: '#E8A868',
  menuBarTitle: '#4A2810',
  menuBarText: '#5C3418',
};

const morning: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #687078 50%,
      #607888 58%, #588898 65%, #5090A8 72%, #4898B8 80%,
      #50A0C0 90%, #58A8C8 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(107,88,42,0.2) 32%, rgba(90,100,80,0.15) 42%, transparent 55%),
    linear-gradient(195deg, rgba(60,75,100,0.25) 0%, transparent 25%, transparent 65%, rgba(60,110,140,0.15) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(70,120,80,0.15) 0%, transparent 70%),
    radial-gradient(ellipse 80% 10% at 60% 58%, rgba(138,140,120,0.15) 0%, transparent 70%)`,
  searchOverlay: 'rgba(70, 130, 160, 0.8)',
  menuBarBg: '#58A8C8',
  menuBarTitle: '#1A3040',
  menuBarText: '#1E3848',
};

const noon: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #748068 50%,
      #7A9070 58%, #80A078 65%, #78B0A0 72%, #70B8C0 80%,
      #68C0D8 90%, #60C8E8 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(120,100,50,0.2) 32%, rgba(100,130,60,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(70,85,100,0.2) 0%, transparent 25%, transparent 65%, rgba(80,140,180,0.1) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(80,150,70,0.25) 0%, transparent 70%),
    radial-gradient(ellipse 80% 10% at 60% 58%, rgba(150,148,116,0.2) 0%, transparent 70%)`,
  searchOverlay: 'rgba(80, 170, 210, 0.8)',
  menuBarBg: '#60C8E8',
  menuBarTitle: '#1A3040',
  menuBarText: '#204050',
};

const sunset: TimeTheme = {
  paletteBackground: `
    linear-gradient(to top,
      #2A2A2E 0%, #3A3335 3%, #5C4033 8%, #6B4E2A 12%,
      #5A6B3A 16%, #4A7C42 19%, #4E8848 22%, #6B8E50 25%,
      #8A8460 30%, #7D7060 35%, #6A6058 42%, #7A5848 50%,
      #9A5840 58%, #B85838 65%, #C85840 72%, #C04858 80%,
      #A04870 90%, #804878 100%
    ),
    linear-gradient(170deg, transparent 0%, rgba(140,80,40,0.25) 32%, rgba(120,90,50,0.2) 42%, transparent 55%),
    linear-gradient(195deg, rgba(80,50,60,0.25) 0%, transparent 25%, transparent 65%, rgba(140,60,100,0.15) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(75,130,60,0.2) 0%, transparent 70%),
    radial-gradient(ellipse 100% 25% at 50% 80%, rgba(200,90,50,0.2) 0%, transparent 70%)`,
  searchOverlay: 'rgba(128, 72, 120, 0.85)',
  menuBarBg: '#804878',
  menuBarTitle: '#F0D0E0',
  menuBarText: '#E0B8D0',
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
    linear-gradient(195deg, rgba(70,50,80,0.3) 0%, transparent 25%, transparent 65%, rgba(60,40,90,0.2) 85%, transparent 100%),
    radial-gradient(ellipse 120% 20% at 30% 54%, rgba(55,110,55,0.22) 0%, transparent 70%),
    radial-gradient(ellipse 100% 25% at 50% 85%, rgba(120,60,100,0.15) 0%, transparent 70%)`,
  searchOverlay: 'rgba(62, 46, 96, 0.85)',
  menuBarBg: '#3E2E60',
  menuBarTitle: '#D8C0E0',
  menuBarText: '#C0A8D0',
};

const themes = { sunrise, morning, noon, sunset, twilight, night, midnight };

export type TimePeriod = keyof typeof themes;

export function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 7) return 'sunrise';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'sunset';
  if (hour >= 17 && hour < 20) return 'twilight';
  if (hour >= 20 && hour < 24) return 'night';
  return 'midnight'; // 0–4
}

export function getCurrentTheme(): TimeTheme {
  return themes[getTimePeriod(new Date().getHours())];
}

export function getTheme(period: TimePeriod): TimeTheme {
  return themes[period];
}

export const ALL_PERIODS: TimePeriod[] = ['sunrise', 'morning', 'noon', 'sunset', 'twilight', 'night', 'midnight'];
