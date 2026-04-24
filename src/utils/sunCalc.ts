/**
 * Lightweight solar position calculator.
 * Computes sunrise, sunset, solar noon, and twilight times
 * for a given date and geographic position.
 *
 * Based on NOAA solar calculator equations.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Solar time boundaries in hours of day. */
export interface SolarTimes {
  dawn: number;       // civil twilight start
  sunrise: number;
  solarNoon: number;
  sunset: number;
  dusk: number;       // civil twilight end
}

function julianDay(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const a = Math.floor((14 - m) / 12);
  const y1 = y + 4800 - a;
  const m1 = m + 12 * a - 3;
  return d + Math.floor((153 * m1 + 2) / 5) + 365 * y1 + Math.floor(y1 / 4)
    - Math.floor(y1 / 100) + Math.floor(y1 / 400) - 32045;
}

function solarDeclination(jd: number): number {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  return Math.asin(Math.sin(23.44 * RAD) * Math.sin(lambda)) * DEG;
}

function equationOfTime(jd: number): number {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const eot = -1.915 * Math.sin(g) - 0.02 * Math.sin(2 * g)
    + 2.466 * Math.sin(2 * L * RAD) - 0.053 * Math.sin(4 * L * RAD);
  return eot * 4; // convert degrees to minutes
}

/**
 * Compute hour angle for a given solar elevation angle.
 * elevation = 0 for sunrise/sunset, -6 for civil twilight.
 */
function hourAngle(lat: number, decl: number, elevation: number): number {
  const cosH = (Math.sin(elevation * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD))
    / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (cosH > 1) return NaN;  // sun never rises
  if (cosH < -1) return NaN; // sun never sets
  return Math.acos(cosH) * DEG;
}

/**
 * Compute solar times for a given date and geographic position.
 * Returns times in local hours (0-24).
 */
export function getSolarTimes(date: Date, lat: number, lng: number): SolarTimes {
  const jd = julianDay(date);
  const decl = solarDeclination(jd);
  const eot = equationOfTime(jd);
  const tzOffset = -date.getTimezoneOffset() / 60;

  // Solar noon in local time
  const solarNoon = 12 - (lng / 15) - (eot / 60) + tzOffset;

  // Hour angles
  const haSunrise = hourAngle(lat, decl, -0.833); // standard refraction correction
  const haDawn = hourAngle(lat, decl, -6);         // civil twilight

  const sunrise = isNaN(haSunrise) ? 6 : solarNoon - haSunrise / 15;
  const sunset = isNaN(haSunrise) ? 18 : solarNoon + haSunrise / 15;
  const dawn = isNaN(haDawn) ? sunrise - 0.5 : solarNoon - haDawn / 15;
  const dusk = isNaN(haDawn) ? sunset + 0.5 : solarNoon + haDawn / 15;

  return { dawn, sunrise, solarNoon, sunset, dusk };
}
