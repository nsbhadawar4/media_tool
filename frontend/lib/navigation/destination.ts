/**
 * Whether following `href` from `current` is a navigation to another page: same origin, and a
 * different path or query. A hash on the current page, the page itself, another site or an
 * unparsable address is not. Pure, so it is testable outside the browser.
 */
export function isNewDestination(href: string, current: { href: string; origin: string; pathname: string; search: string }): boolean {
  let target: URL;
  try {
    target = new URL(href, current.href);
  } catch {
    return false;
  }
  if (target.origin !== current.origin) return false;
  return target.pathname !== current.pathname || target.search !== current.search;
}

/** Links the navigation bar leaves alone even when internal: file and API addresses. */
export function isFileOrApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}
