/**
 * Static route audit: builds the route table from app/ (route groups removed, dynamic segments kept),
 * then checks every internal path written in the source (href, router.push/replace, redirect, Link,
 * NextResponse.redirect, template strings starting with "/") against it. A `${…}` is one or more
 * segments. Exits 1 when a path matches no page/route, so it can gate CI.
 *
 *   node scripts/auditRoutes.mjs [--verbose]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---- routes -------------------------------------------------------------------------------------
const appDir = join(root, 'app');
const routes = [];
for (const f of walk(appDir)) {
  const rel = relative(appDir, f).split(sep);
  const file = rel.pop();
  if (!/^(page|route)\.(tsx|ts)$/.test(file)) continue;
  const segs = rel.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  routes.push({ segs, kind: file.startsWith('page') ? 'page' : 'route', file: relative(root, f) });
}

function matches(route, parts) {
  const r = route.segs;
  let i = 0;
  for (let k = 0; k < r.length; k++) {
    const s = r[k];
    if (/^\[\.\.\..+\]$/.test(s)) return parts.length - i >= 1;
    if (/^\[\[\.\.\..+\]\]$/.test(s)) return true;
    if (i >= parts.length) return false;
    if (!/^\[.+\]$/.test(s) && s !== parts[i] && parts[i] !== '\0') return false;
    i++;
  }
  return i === parts.length;
}

// ---- links --------------------------------------------------------------------------------------
const sources = [...walk(join(root, 'app')), ...walk(join(root, 'components')), ...walk(join(root, 'lib'))].filter((f) => /\.(tsx|ts)$/.test(f));
// Quoted/backticked strings that start with "/" and look like a path.
const STR = /(['"`])(\/[A-Za-z0-9_\-/${}.%:?#=&[\]]*)\1/g;
const LINK_CTX = /(href\s*=\s*\{?\s*$|push\(\s*$|replace\(\s*$|redirect\(\s*$|permanentRedirect\(\s*$|window\.open\(\s*$|location(\.href)?\s*=\s*$|\bpath(name)?\s*[:=]\s*$|\bhref\s*:\s*$|\bto\s*:\s*$)/;

const links = [];
for (const f of sources) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // Nav rows marked planned are drawn as "coming soon", never as links (see Sidebar).
    if (/planned:\s*true/.test(line)) return;
    STR.lastIndex = 0;
    let m;
    while ((m = STR.exec(line))) {
      const before = line.slice(0, m.index);
      if (!LINK_CTX.test(before) && !/redirect\(|NextResponse\.redirect|new URL\(\s*$/.test(before)) continue;
      links.push({ file: relative(root, f), line: idx + 1, raw: m[2] });
    }
  });
}

const skipPrefix = ['/api/', '/_next/', '/images/', '/icons/', '/brand/', '/fonts/'];
const staticFile = /\.(svg|png|jpe?g|webp|ico|json|txt|xml|webmanifest|css|js|mp4|pdf)$/i;
let broken = 0;
let checked = 0;
const bad = [];
for (const l of links) {
  if (skipPrefix.some((p) => l.raw.startsWith(p)) || staticFile.test(l.raw.split(/[?#]/)[0])) continue;
  const path = l.raw.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, '\0');
  const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
  const parts = trimmed.split('/').slice(1).filter((p) => p !== '');
  checked++;
  // A `${…}` run can stand for several segments (a helper that returns a whole path), so try each width.
  const hasPh = parts.some((p) => p.includes('\0'));
  const candidates = [parts];
  if (hasPh) {
    const idx = parts.findIndex((p) => p === '\0');
    if (idx === 0 && parts.length === 1) candidates.push(['\0', '\0'], ['\0', '\0', '\0'], ['\0', '\0', '\0', '\0']);
    else if (idx >= 0) for (let extra = 1; extra <= 3; extra++) candidates.push([...parts.slice(0, idx), ...Array(extra + 1).fill('\0'), ...parts.slice(idx + 1)]);
  }
  const ok = routes.some((r) => candidates.some((c) => matches(r, c.map((p) => (p.includes('\0') && p !== '\0' ? '\0' : p)))));
  if (!ok) {
    broken++;
    bad.push(`${l.file}:${l.line}  ${l.raw}`);
  } else if (verbose) console.log('ok  ', l.raw);
}

console.log(`routes: ${routes.length} (${routes.filter((r) => r.kind === 'page').length} pages, ${routes.filter((r) => r.kind === 'route').length} handlers)`);
console.log(`internal links checked: ${checked}`);
console.log(`links matching no route: ${broken}`);
for (const b of bad) console.log('  BROKEN', b);
process.exit(broken ? 1 : 0);
