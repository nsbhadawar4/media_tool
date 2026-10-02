export const STEP_MS = 170;
export const ROLL_MS = 750;

/** Scoped to the Ludo screen via the `ludo-` prefix; injected once by LudoGame. */
export const LUDO_CSS = `
@keyframes ludo-fade { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes ludo-ring { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes ludo-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14%); } }
@keyframes ludo-hop { 0% { transform: translateY(0) scale(1); } 40% { transform: translateY(-34%) scale(1.14, .94); } 100% { transform: translateY(0) scale(1); } }
@keyframes ludo-burst { 0% { transform: translate(-50%,-50%) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2); opacity: 0; } }
@keyframes ludo-impact { 0% { transform: translate(-50%,-50%) scale(.3); opacity: .9; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }
@keyframes ludo-dest { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes ludo-glow { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
@keyframes ludo-six { 0%,100% { box-shadow: 0 0 0 0 rgba(244,196,48,.0), 0 10px 24px -8px rgba(0,0,0,.7); } 50% { box-shadow: 0 0 0 6px rgba(244,196,48,.18), 0 0 32px 4px rgba(244,196,48,.55); } }
@keyframes ludo-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ludo-appear { from { opacity: 0; } to { opacity: 1; } }
/* Panels fade and rise. The board itself only ever fades: it is never transformed, so it stays crisp. */
.ludo-enter { animation: ludo-enter .4s var(--ease-out) both; }
.ludo-appear { animation: ludo-appear .4s ease-out both; }
.ludo-token { transition: left ${STEP_MS}ms linear, top ${STEP_MS}ms linear, transform ${STEP_MS}ms var(--ease-out), opacity 200ms, filter 200ms; }
.ludo-token.ludo-returning { transition: left 560ms var(--ease-out), top 560ms var(--ease-out), transform 200ms, opacity 200ms; }
/* Selectable token: a glow ring that only changes opacity, and a small hop on the pawn. */
.ludo-valid .ludo-pawn { animation: ludo-bob 1.1s ease-in-out infinite; }
.ludo-ring { position: absolute; inset: -22% -26% -4%; border-radius: 9999px; background: radial-gradient(closest-side, var(--ludo-c), transparent); opacity: 0; pointer-events: none; }
.ludo-valid .ludo-ring { animation: ludo-ring 1.1s ease-in-out infinite; }
.ludo-moving .ludo-ring { opacity: .7; }
.ludo-pulse-opacity { animation: ludo-fade 1.6s ease-in-out infinite; will-change: opacity; }
.ludo-dot { animation: ludo-ring 1.4s ease-in-out infinite; }
.ludo-hop { animation: ludo-hop ${STEP_MS}ms ease-out; }
.ludo-six { animation: ludo-six 1.2s ease-in-out 2; }
.ludo-spark { position: absolute; width: 7px; height: 7px; border-radius: 9999px; animation: ludo-burst 650ms var(--ease-out) forwards; pointer-events: none; }
.ludo-impact { position: absolute; width: 38px; height: 38px; border-radius: 9999px; border: 3px solid #fff; animation: ludo-impact 520ms ease-out forwards; pointer-events: none; }
@keyframes ludo-throw { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(-7px) scale(1.14); } }
.ludo-throw { animation: ludo-throw ${ROLL_MS}ms ease-in-out; }
.ludo-cube { transform-style: preserve-3d; transition: transform ${ROLL_MS}ms cubic-bezier(.2,.8,.25,1); }
.ludo-face { position: absolute; inset: 0; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); place-items: center; padding: 14%; border-radius: 18%; backface-visibility: hidden; background: linear-gradient(145deg, #ffffff, #dfe3ec); box-shadow: inset 0 0 0 1px rgba(0,0,0,.08), inset 0 -6px 12px rgba(0,0,0,.08); }
`;
