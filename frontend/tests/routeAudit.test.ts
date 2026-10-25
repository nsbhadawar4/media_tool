/**
 * Every internal path written in the source must match a page or route under app/ — so a renamed or
 * removed route, or a link typed against the wrong shape, fails here instead of 404ing for a visitor.
 * (scripts/auditLive.mjs is the companion that walks real records against a running site.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chapterPath, classPath, lessonPath, parseLessonParam, subjectPath } from '../lib/content/learnPaths';

const frontend = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

test('every lesson link the builder makes is read back by the lesson route, and nothing else is', () => {
  for (const position of [1, 2, 9, 10, 50]) {
    const segment = lessonPath('class-1', 'english', 'c1-english-meet-alphabet', position).split('/').pop()!;
    assert.equal(parseLessonParam(segment), position, `position ${position} must round-trip`);
  }
  for (const bad of ['0', '01', '1.5', '-1', 'abc', '', '100', '1e1']) assert.ok(Number.isNaN(parseLessonParam(bad)), `"${bad}" is not a lesson address`);
});

test('the lesson route resolves its segment with parseLessonParam, and lesson links are built only by lessonPath', () => {
  const page = readFileSync(join(frontend, 'app/classes/[slug]/[subject]/[chapter]/[lesson]/page.tsx'), 'utf8');
  assert.match(page, /parseLessonParam/, 'the lesson page must parse its segment with the shared parser');
  assert.match(page, /lessons\[(?:lessonNumber\(lesson\)|n) - 1\]/, 'the lesson page resolves by position (n - 1)');
  // A lesson address typed by hand (…/<chapter>/${n}) can drift from the route; chapterPath(...)/${raw} in the
  // lesson page's own retry/canonical links is the one allowed spelling (it echoes the address it was given).
  const manual = /\$\{(?:chapterPath\([^)]*\)|[a-zA-Z.]*chapter[a-zA-Z.]*)\}\/\$\{(?!raw\b|lesson\b)/;
  const offenders = walk(join(frontend, 'app')).concat(walk(join(frontend, 'components')), walk(join(frontend, 'lib'))).filter((f) => !f.endsWith(join('content', 'learnPaths.ts')) && manual.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, [], 'build lesson URLs with lessonPath(), not by hand');
});

test('no internal link points at a route that does not exist', () => {
  const run = spawnSync(process.execPath, ['scripts/auditRoutes.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('the learning route builders encode every segment and agree with the lesson route', () => {
  assert.equal(lessonPath('class-1', 'math', 'c1-math-count-10', 1), '/classes/class-1/math/c1-math-count-10/1');
  assert.equal(lessonPath('class-8', 'hindi', 'c8-x', 12), '/classes/class-8/hindi/c8-x/12');
  assert.equal(chapterPath('class-1', 'math', 'a b'), '/classes/class-1/math/a%20b');
  assert.equal(subjectPath('class-1', 'a/b'), '/classes/class-1/a%2Fb');
  assert.equal(classPath('class-1'), '/classes/class-1');
});
