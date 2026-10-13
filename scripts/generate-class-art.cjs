// Generates frontend/public/images/classes/class-{1..5}.svg: one original flat illustration of a
// child learning per class (used by components/kid-games/cards/ClassCourseCard.tsx).
// Run from the repo root: node scripts/generate-class-art.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../frontend/public/images/classes');
fs.mkdirSync(OUT, { recursive: true });

const W = 800, H = 500, CX = 400;

/** Soft scene background: gradient, two blurred blobs, a few sparkles and dots. */
function background(p) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#1e1b4b" flood-opacity="0.16"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="140" cy="120" r="150" fill="${p.a1}" opacity="0.28" filter="url(#soft)"/>
  <circle cx="680" cy="380" r="170" fill="${p.a2}" opacity="0.26" filter="url(#soft)"/>
  <circle cx="660" cy="90" r="70" fill="#ffffff" opacity="0.55" filter="url(#soft)"/>
  ${sparkle(110, 360, 14, p.a1)}${sparkle(700, 150, 11, p.a2)}${sparkle(610, 60, 7, p.a1)}
  <circle cx="230" cy="70" r="5" fill="${p.a2}" opacity="0.5"/><circle cx="560" cy="430" r="6" fill="${p.a1}" opacity="0.45"/>
  <circle cx="80" cy="230" r="4" fill="${p.a1}" opacity="0.5"/><circle cx="745" cy="260" r="4" fill="${p.a2}" opacity="0.5"/>`;
}
function sparkle(x, y, r, c) {
  return `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="${c}" opacity="0.75"/>`;
}

/** Hair, drawn behind (back) and over (front) the head, per style. */
function hair(style, c, hx, hy) {
  const r = 80;
  switch (style) {
    case 'pigtails':
      return {
        back: `<circle cx="${hx - 92}" cy="${hy + 10}" r="34" fill="${c}"/><circle cx="${hx + 92}" cy="${hy + 10}" r="34" fill="${c}"/>
               <circle cx="${hx - 70}" cy="${hy - 14}" r="9" fill="#f472b6"/><circle cx="${hx + 70}" cy="${hy - 14}" r="9" fill="#f472b6"/>`,
        front: `<path d="M${hx - r} ${hy - 4} Q${hx - r} ${hy - r - 18} ${hx} ${hy - r - 14} Q${hx + r} ${hy - r - 18} ${hx + r} ${hy - 4} Q${hx + 30} ${hy - 46} ${hx - 6} ${hy - 30} Q${hx - 44} ${hy - 52} ${hx - r} ${hy - 4}Z" fill="${c}"/>`,
      };
    case 'curly':
      return {
        back: '',
        front: [[-62, -40], [-36, -66], [-4, -76], [30, -70], [58, -50], [74, -22], [-76, -14]].map(([dx, dy]) => `<circle cx="${hx + dx}" cy="${hy + dy}" r="28" fill="${c}"/>`).join(''),
      };
    case 'bob':
      return {
        back: `<path d="M${hx - r - 8} ${hy - 10} Q${hx - r - 12} ${hy + 70} ${hx - 50} ${hy + 64} L${hx + 50} ${hy + 64} Q${hx + r + 12} ${hy + 70} ${hx + r + 8} ${hy - 10}Z" fill="${c}"/>`,
        front: `<path d="M${hx - r - 6} ${hy + 6} Q${hx - r - 4} ${hy - r - 22} ${hx} ${hy - r - 16} Q${hx + r + 4} ${hy - r - 22} ${hx + r + 6} ${hy + 6} Q${hx + 40} ${hy - 30} ${hx} ${hy - 34} Q${hx - 40} ${hy - 30} ${hx - r - 6} ${hy + 6}Z" fill="${c}"/>
                <path d="M${hx - 70} ${hy - 44} Q${hx} ${hy - 84} ${hx + 70} ${hy - 44}" stroke="#facc15" stroke-width="10" fill="none" stroke-linecap="round"/>`,
      };
    case 'sidepart':
      return {
        back: '',
        front: `<path d="M${hx - r} ${hy - 2} Q${hx - r - 4} ${hy - r - 20} ${hx + 6} ${hy - r - 14} Q${hx + r + 6} ${hy - r - 10} ${hx + r} ${hy - 6} Q${hx + 66} ${hy - 40} ${hx + 20} ${hy - 44} Q${hx - 30} ${hy - 30} ${hx - 54} ${hy - 50} Q${hx - 70} ${hy - 30} ${hx - r} ${hy - 2}Z" fill="${c}"/>`,
      };
    case 'ponytail':
      return {
        back: `<path d="M${hx + 60} ${hy - 50} Q${hx + 150} ${hy - 40} ${hx + 120} ${hy + 60} Q${hx + 110} ${hy + 10} ${hx + 70} ${hy - 10}Z" fill="${c}"/>`,
        front: `<path d="M${hx - r} ${hy} Q${hx - r - 2} ${hy - r - 20} ${hx} ${hy - r - 16} Q${hx + r + 2} ${hy - r - 20} ${hx + r} ${hy} Q${hx + 50} ${hy - 50} ${hx} ${hy - 46} Q${hx - 56} ${hy - 44} ${hx - r} ${hy}Z" fill="${c}"/>
                <circle cx="${hx + 70}" cy="${hy - 50}" r="11" fill="#f43f5e"/>`,
      };
    default:
      return { back: '', front: '' };
  }
}

/** A child from the waist up: torso, neck, head, face, hair. Props are drawn over it. */
function child(k) {
  const hx = k.hx ?? CX, hy = k.hy ?? 236;
  const h = hair(k.hair, k.hairColor, hx, hy);
  const glasses = k.glasses
    ? `<g stroke="#1f2937" stroke-width="5" fill="#ffffff" fill-opacity="0.25"><circle cx="${hx - 30}" cy="${hy + 6}" r="19"/><circle cx="${hx + 30}" cy="${hy + 6}" r="19"/><path d="M${hx - 11} ${hy + 4} Q${hx} ${hy - 2} ${hx + 11} ${hy + 4}" fill="none"/></g>`
    : '';
  return `
  <g filter="url(#shadow)">
    ${h.back}
    <path d="M${hx - 128} ${H} Q${hx - 130} ${hy + 140} ${hx - 60} ${hy + 120} L${hx + 60} ${hy + 120} Q${hx + 130} ${hy + 140} ${hx + 128} ${H}Z" fill="${k.shirt}"/>
    <path d="M${hx - 40} ${hy + 120} Q${hx} ${hy + 160} ${hx + 40} ${hy + 120}" fill="${k.collar}"/>
    <rect x="${hx - 20}" y="${hy + 64}" width="40" height="60" rx="16" fill="${k.skinShade}"/>
    <circle cx="${hx - 80}" cy="${hy + 10}" r="16" fill="${k.skin}"/><circle cx="${hx + 80}" cy="${hy + 10}" r="16" fill="${k.skin}"/>
    <circle cx="${hx}" cy="${hy}" r="80" fill="${k.skin}"/>
    ${h.front}
    <ellipse cx="${hx - 30}" cy="${hy + 8}" rx="8" ry="10" fill="#1f2937"/><ellipse cx="${hx + 30}" cy="${hy + 8}" rx="8" ry="10" fill="#1f2937"/>
    <circle cx="${hx - 27}" cy="${hy + 4}" r="3" fill="#ffffff"/><circle cx="${hx + 33}" cy="${hy + 4}" r="3" fill="#ffffff"/>
    ${glasses}
    <ellipse cx="${hx - 52}" cy="${hy + 34}" rx="13" ry="8" fill="#fb7185" opacity="0.35"/><ellipse cx="${hx + 52}" cy="${hy + 34}" rx="13" ry="8" fill="#fb7185" opacity="0.35"/>
    <path d="M${hx - 20} ${hy + 40} Q${hx} ${hy + 58} ${hx + 20} ${hy + 40}" stroke="#7c2d12" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`;
}
const hand = (x, y, skin) => `<circle cx="${x}" cy="${y}" r="20" fill="${skin}"/>`;
const arm = (x1, y1, x2, y2, c) => `<path d="M${x1} ${y1} Q${(x1 + x2) / 2 + (x1 < x2 ? -20 : 20)} ${(y1 + y2) / 2 + 30} ${x2} ${y2}" stroke="${c}" stroke-width="38" stroke-linecap="round" fill="none"/>`;

function svg(p, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
  <title>${title}</title>${background(p)}${body}
</svg>
`;
}

const scenes = {
  // Class 1 — playful beginnings: a child holding a big ABC block, more blocks and a crayon around.
  1: () => {
    const p = { bg1: '#fff6e6', bg2: '#ffe6ef', a1: '#f59e0b', a2: '#ec4899' };
    const k = { skin: '#f1c19b', skinShade: '#e0a87f', hair: 'pigtails', hairColor: '#4a2c1d', shirt: '#f59e0b', collar: '#fbbf24' };
    const block = (x, y, s, c, letter, rot = 0) => `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})" filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.16}" fill="${c}"/><rect x="${x + s * 0.1}" y="${y + s * 0.1}" width="${s * 0.8}" height="${s * 0.8}" rx="${s * 0.12}" fill="#ffffff" opacity="0.9"/>
      <text x="${x + s / 2}" y="${y + s * 0.7}" text-anchor="middle" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="800" font-size="${s * 0.56}" fill="${c}">${letter}</text></g>`;
    return svg(p, `${child(k)}
      ${arm(300, 420, 350, 392, k.shirt)}${arm(500, 420, 450, 392, k.shirt)}
      ${block(338, 336, 124, '#ec4899', 'A')}${hand(338, 398, k.skin)}${hand(462, 398, k.skin)}
      ${block(110, 150, 78, '#0ea5e9', 'B', -12)}${block(612, 210, 84, '#22c55e', 'C', 10)}${block(150, 270, 56, '#8b5cf6', '1', 8)}
      <g transform="rotate(-30 640 120)"><rect x="570" y="110" width="110" height="22" rx="6" fill="#f59e0b"/><path d="M680 110 L708 121 L680 132Z" fill="#fcd9a8"/><path d="M698 117 L708 121 L698 125Z" fill="#7c2d12"/></g>`, 'A young child holding a big alphabet block, surrounded by colourful learning blocks');
  },
  // Class 2 — reading and writing: a child reading an open storybook, letters floating up.
  2: () => {
    const p = { bg1: '#e8f6fd', bg2: '#efeafe', a1: '#0ea5e9', a2: '#8b5cf6' };
    const k = { skin: '#8d5a3b', skinShade: '#7a4b30', hair: 'curly', hairColor: '#1f1410', shirt: '#0ea5e9', collar: '#7dd3fc' };
    const lines = (x, y) => [0, 1, 2, 3].map((i) => `<rect x="${x}" y="${y + i * 16}" width="${i === 3 ? 60 : 92}" height="6" rx="3" fill="#94a3b8" opacity="0.7"/>`).join('');
    return svg(p, `${child(k)}
      ${arm(296, 430, 330, 400, k.shirt)}${arm(504, 430, 470, 400, k.shirt)}
      <g filter="url(#shadow)"><path d="M262 360 Q330 340 400 362 L400 470 Q330 448 262 468Z" fill="#ffffff"/><path d="M538 360 Q470 340 400 362 L400 470 Q470 448 538 468Z" fill="#f8fafc"/>
      <path d="M400 362 L400 470" stroke="#cbd5e1" stroke-width="3"/>${lines(286, 382)}${lines(424, 382)}
      <path d="M256 466 Q330 446 400 470 Q470 446 544 466 L544 476 Q470 456 400 480 Q330 456 256 476Z" fill="#8b5cf6"/></g>
      ${hand(270, 428, k.skin)}${hand(530, 428, k.skin)}
      ${['a', 'b', 'c', 'ह', 'अ'].map((l, i) => `<text x="${[150, 650, 212, 590, 108][i]}" y="${[140, 176, 250, 286, 330][i]}" font-family="Arial, Noto Sans Devanagari, sans-serif" font-weight="800" font-size="${[54, 48, 38, 44, 40][i]}" fill="${i % 2 ? '#8b5cf6' : '#0ea5e9'}" opacity="0.8" transform="rotate(${[-10, 8, 6, -6, 10][i]} ${[150, 650, 212, 590, 108][i]} ${[140, 176, 250, 286, 330][i]})">${l}</text>`).join('')}
      <g transform="translate(560 300)"><rect x="0" y="0" width="92" height="60" rx="18" fill="#ffffff" filter="url(#shadow)"/><path d="M18 58 L10 78 L34 60Z" fill="#ffffff"/><circle cx="28" cy="30" r="6" fill="#0ea5e9"/><circle cx="46" cy="30" r="6" fill="#8b5cf6"/><circle cx="64" cy="30" r="6" fill="#0ea5e9"/></g>`, 'A child reading an open storybook, with letters floating around');
  },
  // Class 3 — exploring and discovering: magnifying glass, a sprouting plant and a science flask.
  3: () => {
    const p = { bg1: '#f1ecff', bg2: '#e6e9fe', a1: '#8b5cf6', a2: '#6366f1' };
    const k = { skin: '#f6d3b8', skinShade: '#e8bc9c', hair: 'bob', hairColor: '#2b1a12', shirt: '#7c3aed', collar: '#c4b5fd', hx: 360 };
    return svg(p, `${child(k)}
      ${arm(270, 440, 300, 400, k.shirt)}${arm(452, 440, 520, 330, k.shirt)}
      <g filter="url(#shadow)"><circle cx="560" cy="250" r="58" fill="#e0f2fe" fill-opacity="0.55" stroke="#4338ca" stroke-width="14"/><path d="M528 222 Q548 206 572 210" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round"/>
      <rect x="512" y="296" width="22" height="80" rx="11" fill="#4338ca" transform="rotate(30 523 336)"/></g>
      ${hand(520, 336, k.skin)}
      <g filter="url(#shadow)"><path d="M250 410 L330 410 L320 470 L260 470Z" fill="#f97316"/><rect x="244" y="400" width="92" height="18" rx="6" fill="#fb923c"/>
      <path d="M290 400 Q290 360 290 340" stroke="#16a34a" stroke-width="6" fill="none"/><path d="M290 360 Q256 350 250 320 Q284 324 290 360Z" fill="#22c55e"/><path d="M290 348 Q318 330 330 302 Q298 306 290 348Z" fill="#4ade80"/></g>
      ${hand(300, 404, k.skin)}
      <g transform="translate(120 120)" filter="url(#shadow)"><path d="M22 0 L46 0 L46 34 L70 84 Q74 96 60 96 L8 96 Q-6 96 -2 84 L22 34Z" fill="#ffffff"/><path d="M8 66 L60 66 L66 82 Q68 90 58 90 L10 90 Q0 90 2 82Z" fill="#a78bfa"/><circle cx="26" cy="76" r="4" fill="#ffffff"/><circle cx="42" cy="80" r="3" fill="#ffffff"/><rect x="18" y="-6" width="32" height="10" rx="4" fill="#6366f1"/></g>
      <g transform="translate(650 120)" stroke="#6366f1" stroke-width="4" fill="none" opacity="0.8"><ellipse cx="0" cy="0" rx="46" ry="16"/><ellipse cx="0" cy="0" rx="46" ry="16" transform="rotate(60)"/><ellipse cx="0" cy="0" rx="46" ry="16" transform="rotate(-60)"/><circle cx="0" cy="0" r="7" fill="#8b5cf6" stroke="none"/></g>`, 'A curious child exploring with a magnifying glass, a growing plant and a science flask');
  },
  // Class 4 — studying and problem solving: a child with glasses, notebook of sums, pencil, board.
  4: () => {
    const p = { bg1: '#e4f8fb', bg2: '#e4ecfd', a1: '#06b6d4', a2: '#2563eb' };
    const k = { skin: '#c68a5e', skinShade: '#b27a50', hair: 'sidepart', hairColor: '#1c1917', shirt: '#2563eb', collar: '#93c5fd', glasses: true };
    return svg(p, `
      <g transform="translate(92 74)" filter="url(#shadow)"><rect width="230" height="150" rx="18" fill="#0f3d4a"/><rect x="10" y="10" width="210" height="130" rx="12" fill="#134e5e"/>
      <text x="30" y="62" font-family="Courier New, monospace" font-weight="700" font-size="30" fill="#e0f2fe">7 × 8 = 56</text><text x="30" y="108" font-family="Courier New, monospace" font-weight="700" font-size="26" fill="#a5f3fc">½ + ¼ = ¾</text></g>
      <g transform="translate(520 96)" fill="none" stroke="#2563eb" stroke-width="5" opacity="0.75"><path d="M0 90 L60 0 L120 90Z"/><circle cx="160" cy="40" r="34"/><rect x="40" y="110" width="70" height="70" rx="6"/></g>
      ${child(k)}
      ${arm(300, 430, 340, 404, k.shirt)}${arm(500, 430, 470, 404, k.shirt)}
      <g filter="url(#shadow)"><rect x="300" y="372" width="200" height="120" rx="12" fill="#ffffff"/><rect x="300" y="372" width="200" height="22" rx="10" fill="#06b6d4"/>
      ${[0, 1, 2].map((i) => `<path d="M318 ${418 + i * 22} L482 ${418 + i * 22}" stroke="#e2e8f0" stroke-width="3"/>`).join('')}
      <text x="322" y="440" font-family="Comic Sans MS, Arial, sans-serif" font-weight="700" font-size="24" fill="#1e3a8a">24 ÷ 6 = 4</text><circle cx="470" cy="466" r="12" fill="#22c55e"/><path d="M464 466 L469 471 L477 461" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      ${hand(316, 410, k.skin)}
      <g transform="rotate(-52 520 380)"><rect x="470" y="372" width="96" height="16" rx="5" fill="#facc15"/><path d="M566 372 L586 380 L566 388Z" fill="#fde68a"/><rect x="460" y="372" width="12" height="16" rx="3" fill="#f472b6"/></g>
      ${hand(480, 404, k.skin)}`, 'A child with glasses solving maths problems in a notebook, with a chalkboard of sums behind');
  },
  // Class 5 — confident and prepared: a child with a tablet, a stack of books and a trophy.
  5: () => {
    const p = { bg1: '#ffeaee', bg2: '#fff3df', a1: '#f43f5e', a2: '#f59e0b' };
    const k = { skin: '#e9b48e', skinShade: '#d89f78', hair: 'ponytail', hairColor: '#3b2416', shirt: '#e11d48', collar: '#fda4af', hx: 420 };
    const book = (x, y, w, c) => `<rect x="${x}" y="${y}" width="${w}" height="30" rx="6" fill="${c}"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="4" rx="2" fill="#ffffff" opacity="0.7"/>`;
    return svg(p, `
      <g filter="url(#shadow)">${book(96, 440, 170, '#2563eb')}${book(110, 410, 150, '#f59e0b')}${book(100, 380, 160, '#16a34a')}${book(118, 350, 130, '#8b5cf6')}</g>
      <g transform="translate(150 230)" filter="url(#shadow)"><path d="M0 0 L70 0 L66 46 Q60 78 35 80 Q10 78 4 46Z" fill="#f59e0b"/><path d="M0 10 Q-26 12 -20 34 Q-14 50 6 48" stroke="#f59e0b" stroke-width="8" fill="none"/><path d="M70 10 Q96 12 90 34 Q84 50 64 48" stroke="#f59e0b" stroke-width="8" fill="none"/><rect x="25" y="80" width="20" height="22" fill="#d97706"/><rect x="8" y="100" width="54" height="16" rx="4" fill="#b45309"/><path d="M35 18 L40 30 L53 31 L43 39 L46 52 L35 45 L24 52 L27 39 L17 31 L30 30Z" fill="#fef3c7"/></g>
      ${child(k)}
      ${arm(320, 440, 360, 404, k.shirt)}${arm(520, 440, 486, 404, k.shirt)}
      <g filter="url(#shadow)"><rect x="330" y="340" width="180" height="140" rx="18" fill="#1f2937"/><rect x="342" y="352" width="156" height="116" rx="10" fill="#ffffff"/>
      <rect x="360" y="420" width="18" height="34" rx="4" fill="#f59e0b"/><rect x="388" y="404" width="18" height="50" rx="4" fill="#f43f5e"/><rect x="416" y="388" width="18" height="66" rx="4" fill="#2563eb"/><rect x="444" y="372" width="18" height="82" rx="4" fill="#16a34a"/>
      <circle cx="476" cy="372" r="12" fill="#16a34a"/><path d="M470 372 L475 377 L483 367" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      ${hand(342, 410, k.skin)}${hand(498, 410, k.skin)}
      <g transform="translate(580 116) rotate(-10)" filter="url(#shadow)"><path d="M0 30 L60 0 L120 30 L60 60Z" fill="#1f2937"/><path d="M28 44 L28 74 Q60 92 92 74 L92 44 L60 60Z" fill="#374151"/><path d="M120 30 L120 70" stroke="#f59e0b" stroke-width="4"/><circle cx="120" cy="74" r="7" fill="#f59e0b"/></g>`, 'A confident child learning on a tablet, with a stack of books, a trophy and a graduation cap');
  },
};

for (const [n, make] of Object.entries(scenes)) {
  fs.writeFileSync(path.join(OUT, `class-${n}.svg`), make());
}
console.log('wrote', Object.keys(scenes).length, 'illustrations to', OUT);
