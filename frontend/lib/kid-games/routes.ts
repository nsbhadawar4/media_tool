import type { Subject } from './types';

/** /kid-games/class-3/math/addition-adventure: one game, which goes full screen on phones. */
const KID_GAME_ROUTE = /^\/kid-games\/class-[1-5]\/(hindi|english|math)\/[a-z0-9-]+\/?$/;

export function isKidGameRoute(pathname: string): boolean {
  return KID_GAME_ROUTE.test(pathname);
}

/** The subject of a kid-game route, so the right loader shows before anything else has loaded. */
export function kidGameRouteSubject(pathname: string): Subject | null {
  return (KID_GAME_ROUTE.exec(pathname)?.[1] as Subject | undefined) ?? null;
}
