import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'media_tool — Your Digital World, Organized.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The share card for the public site (and, as the root segment's image, any page without its
 * own). Rendered once at build time from the brand mark and the hero line.
 */
export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/brand/logo-mark.svg'));
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background:
            'radial-gradient(60% 80% at 100% 0%, rgba(124,58,237,0.55), transparent 60%), radial-gradient(50% 70% at 0% 100%, rgba(192,132,252,0.25), transparent 70%), #09090b',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
          <img src={logoSrc} width={72} height={72} alt="" />
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>media_tool</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>
            <span>Your Digital World,&nbsp;</span>
            <span style={{ color: '#c084fc' }}>Organized.</span>
          </div>
          <div style={{ fontSize: 32, color: '#a1a1aa', maxWidth: 900 }}>
            Photos, videos, documents and learning games — in one private place.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Media Library', 'Documents', 'Folders', 'Games', 'Kid Games'].map((label) => (
            <span
              key={label}
              style={{
                fontSize: 22,
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e4e4e7',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
