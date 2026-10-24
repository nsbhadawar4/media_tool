/**
 * Every internal path written in the source must match a page or route under app/ — so a renamed or
 * removed route, or a link typed against the wrong shape, fails here instead of 404ing for a visitor.
 * (scripts/auditLive.mjs is the companion that walks real records against a running site.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chapterPath, classPath, lessonPath, subjectPath } from '../lib/content/learnPaths';

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
