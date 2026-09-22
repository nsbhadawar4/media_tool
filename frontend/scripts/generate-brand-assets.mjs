/**
 * Rasterises every icon this app ships from one SVG.
 *
 * public/brand/logo-mark.svg is the source. Committing the PNGs without it would leave
 * nobody able to change the mark without redrawing it, and the set would drift the first
 * time one of them was edited by hand — a favicon saying one thing and the installed app
 * icon another.
 *
 * Usage (from the repo root):
 *   npm run brand --workspace frontend
 *
 * Not part of the build. The assets are committed, so a deploy never has to run this, and
 * it only needs running when the mark itself changes.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Loaded through require: this file is ESM and sharp's ESM entry uses import attributes,
 * which Node 20 — the version Vercel builds on — does not parse. The CJS build is the
 * same library. Same reasoning as backend/smoke-vercel.mts.
 */
const sharp = createRequire(import.meta.url)('sharp');

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = path.join(FRONTEND, 'public', 'brand', 'logo-mark.svg');

/**
 * Android crops a maskable icon to whatever shape the launcher uses, and only the middle
 * ~80% is guaranteed to survive. So the maskable variant is the same mark drawn smaller on
 * a full-bleed background — the rounded corners of the tile are expendable there, the
 * glyph is not.
 */
const MASKABLE_SAFE_RATIO = 0.62;

/** Brand accent, matching --accent in globals.css and the manifest's theme colour. */
const BACKGROUND = '#6D5EF8';

async function renderSquare(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

/**
 * Wraps a single PNG in an ICO container.
 *
 * Written out by hand because nothing in the dependency tree writes .ico, and because the
 * format allows it: an icon directory entry may point at a PNG rather than a bitmap, which
 * every browser since IE11 reads. One 32px entry is enough — browsers downscale it for the
 * 16px slot themselves, and far better than a hand-quantised 16px bitmap would.
 */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size: none
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // offset to the image data

  return Buffer.concat([header, entry, png]);
}

async function main() {
  const svg = await fsp.readFile(SOURCE, 'utf8');

  // The maskable variant: full-bleed accent, mark inset into the safe area.
  const maskableSize = 512;
  const inner = Math.round(maskableSize * MASKABLE_SAFE_RATIO);
  const maskable = await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: await renderSquare(svg, inner), gravity: 'centre' }])
    .png()
    .toBuffer();

  const targets = [
    ['public/icons/icon-192.png', await renderSquare(svg, 192)],
    ['public/icons/icon-512.png', await renderSquare(svg, 512)],
    ['public/icons/icon-maskable-512.png', maskable],
    // iOS draws its own rounded corners over whatever it is given and does not support
    // transparency, so this one is flattened onto the accent.
    [
      'public/icons/apple-touch-icon.png',
      await sharp(await renderSquare(svg, 180))
        .flatten({ background: BACKGROUND })
        .png()
        .toBuffer(),
    ],
    // Next.js serves app/icon.png as the tab icon; app/icon.svg beside it is preferred by
    // browsers that support it, and this is the fallback.
    ['app/icon.png', await renderSquare(svg, 256)],
    ['app/favicon.ico', icoFromPng(await renderSquare(svg, 32), 32)],
  ];

  for (const [relative, data] of targets) {
    const destination = path.join(FRONTEND, relative);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, data);
    console.log(`${relative.padEnd(40)} ${data.length} bytes`);
  }

  // The tab icon, as vector. Kept byte-identical to the source rather than re-exported, so
  // there is exactly one drawing of this mark in the repository.
  await fsp.writeFile(path.join(FRONTEND, 'app', 'icon.svg'), svg);
  console.log('app/icon.svg'.padEnd(40) + `${Buffer.byteLength(svg)} bytes`);
}

await main();
