/**
 * What the admin panel may show about where a request came from: a masked IP address and a
 * coarse device / browser description. Raw addresses stay in the database for security
 * investigations and never leave the API; nothing here infers a location.
 */

/** "203.0.113.42" → "203.0.113.•••"; IPv6 keeps its first three groups. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/i, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return `${v4.split('.').slice(0, 3).join('.')}.•••`;
  if (ip.includes(':')) {
    const groups = ip.split(':').filter(Boolean);
    return groups.length ? `${groups.slice(0, 3).join(':')}:••••` : null;
  }
  return null;
}

export interface ClientDescription {
  /** Desktop, Mobile or Tablet. */
  device: string | null;
  os: string | null;
  browser: string | null;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** A short, coarse reading of a User-Agent header — enough to recognise "a new device". */
export function describeUserAgent(ua: string | null | undefined): ClientDescription {
  if (!ua) return { device: null, os: null, browser: null };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  const device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|iPod/.test(ua) ? 'Mobile' : os ? 'Desktop' : null;
  return { device, os, browser };
}
