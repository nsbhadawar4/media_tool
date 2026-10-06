/**
 * Kid Games content: every one of the 150 games must be playable and correct.
 *
 * The content is hand-written data, so these checks are what stop a typo from becoming a
 * question with no right answer: each game exists for every class, each question fits the
 * engine that plays it, every choice question contains its answer exactly once, arithmetic
 * shown as "a + b = ?" really adds up, and every game can fill a ten-item session without
 * repeating itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_GAMES, CLASS_LEVELS, SUBJECTS, TEMPLATES } from '../lib/kid-games/catalog';
import { buildSession, generateQuestions, sameNumber, sessionPoints, SESSION_TARGET, type Rng } from '../lib/kid-games/session';
import { ENGINE_KINDS, type ClassLevel, type Question, type Subject, type SubjectContent } from '../lib/kid-games/types';

import c1hindi from '../data/kid-games/class1/hindi';
import c1english from '../data/kid-games/class1/english';
import c1math from '../data/kid-games/class1/math';
import c2hindi from '../data/kid-games/class2/hindi';
import c2english from '../data/kid-games/class2/english';
import c2math from '../data/kid-games/class2/math';
import c3hindi from '../data/kid-games/class3/hindi';
import c3english from '../data/kid-games/class3/english';
import c3math from '../data/kid-games/class3/math';
import c4hindi from '../data/kid-games/class4/hindi';
import c4english from '../data/kid-games/class4/english';
import c4math from '../data/kid-games/class4/math';
import c5hindi from '../data/kid-games/class5/hindi';
import c5english from '../data/kid-games/class5/english';
import c5math from '../data/kid-games/class5/math';

const CONTENT: Record<ClassLevel, Record<Subject, SubjectContent>> = {
  1: { hindi: c1hindi, english: c1english, math: c1math },
  2: { hindi: c2hindi, english: c2english, math: c2math },
  3: { hindi: c3hindi, english: c3english, math: c3math },
  4: { hindi: c4hindi, english: c4english, math: c4math },
  5: { hindi: c5hindi, english: c5english, math: c5math },
};

/** Deterministic random source so a failure reproduces. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const num = (s: string) => Number(s.replace(/,/g, ''));

/** If a question shows plain arithmetic ("12 × 3 = ?"), returns the true result. */
function arithmetic(question: Question): number | null {
  const text = 'visual' in question && question.visual ? question.visual : '';
  const m = /^([\d,]+(?:\.\d+)?)\s*([+\-−×x÷])\s*([\d,]+(?:\.\d+)?)\s*=\s*\?$/.exec(text.trim());
  if (!m) return null;
  const a = num(m[1]);
  const b = num(m[3]);
  const r = { '+': a + b, '-': a - b, '−': a - b, '×': a * b, x: a * b, '÷': a / b }[m[2]];
  return r === undefined ? null : Math.round(r * 1e6) / 1e6;
}

function where(classLevel: number, subject: string, slot: string, i?: number) {
  return `class ${classLevel} ${subject}/${slot}${i === undefined ? '' : ` question ${i + 1}`}`;
}

function checkQuestion(q: Question, engine: string, at: string) {
  assert.ok(q.prompt && q.prompt.trim() === q.prompt, `${at}: prompt must be non-empty and trimmed`);
  switch (q.kind) {
    case 'choice': {
      assert.ok(q.options.length >= 2 && q.options.length <= 4, `${at}: 2–4 options`);
      assert.equal(new Set(q.options).size, q.options.length, `${at}: options must be unique`);
      assert.equal(q.options.filter((o) => o === q.answer).length, 1, `${at}: answer "${q.answer}" must be one of the options`);
      for (const o of q.options) assert.ok(o.trim() === o && o.length > 0, `${at}: option "${o}" must be trimmed`);
      if (engine === 'fill-blank') {
        assert.ok((q.sentence ?? q.prompt).includes('___'), `${at}: fill-blank needs ___ in sentence or prompt`);
      }
      const truth = arithmetic(q);
      if (truth !== null) assert.equal(num(q.answer), truth, `${at}: ${q.visual} is ${truth}, not ${q.answer}`);
      break;
    }
    case 'number': {
      assert.match(q.answer, /^-?\d+(\.\d+)?(\/\d+)?$/, `${at}: number answer "${q.answer}" must be digits, a decimal or a fraction`);
      const truth = arithmetic(q);
      if (truth !== null) assert.ok(sameNumber(String(truth), q.answer), `${at}: ${q.visual} is ${truth}, not ${q.answer}`);
      break;
    }
    case 'match': {
      const max = engine === 'memory' ? 6 : 5;
      assert.ok(q.pairs.length >= 3 && q.pairs.length <= max, `${at}: 3–${max} pairs`);
      const sides = q.pairs.flat();
      assert.equal(new Set(sides).size, sides.length, `${at}: every card/side must be unique`);
      break;
    }
    case 'order': {
      assert.ok(q.items.length >= 3 && q.items.length <= 6, `${at}: 3–6 items`);
      assert.equal(new Set(q.items).size, q.items.length, `${at}: items must be unique`);
      break;
    }
    case 'build': {
      assert.ok(q.tiles.length >= 2 && q.tiles.length <= 8, `${at}: 2–8 tiles`);
      for (const extra of q.extra ?? []) assert.ok(!q.tiles.includes(extra), `${at}: extra tile "${extra}" is also a real tile`);
      assert.ok((q.extra ?? []).length <= 3, `${at}: at most 3 extra tiles`);
      break;
    }
    case 'sort': {
      assert.ok(q.buckets.length >= 2 && q.buckets.length <= 3, `${at}: 2–3 buckets`);
      assert.ok(q.items.length >= 4 && q.items.length <= 6, `${at}: 4–6 items`);
      assert.equal(new Set(q.items.map((i) => i.text)).size, q.items.length, `${at}: items must be unique`);
      for (const item of q.items) assert.ok(q.buckets.includes(item.bucket), `${at}: "${item.text}" goes to unknown bucket "${item.bucket}"`);
      for (const bucket of q.buckets) assert.ok(q.items.some((i) => i.bucket === bucket), `${at}: bucket "${bucket}" is never used`);
      break;
    }
  }
}

test('the catalogue has 150 games: 10 per subject per class', () => {
  assert.equal(ALL_GAMES.length, 150);
  assert.equal(new Set(ALL_GAMES.map((g) => g.id)).size, 150);
  for (const subject of SUBJECTS) assert.equal(TEMPLATES[subject].length, 10);
});

test('every class and subject has 4 easy, 4 medium and 2 hard games, each with its own name', () => {
  for (const classLevel of CLASS_LEVELS) {
    for (const subject of SUBJECTS) {
      const games = ALL_GAMES.filter((g) => g.classLevel === classLevel && g.subject === subject);
      const count = (d: string) => games.filter((g) => g.difficulty === d).length;
      assert.deepEqual([count('easy'), count('medium'), count('hard')], [4, 4, 2], `class ${classLevel} ${subject}`);
      for (const game of games) {
        assert.ok(game.title.trim() && game.description.trim(), `${game.id}: title and description`);
        if (subject === 'hindi') assert.ok(game.gloss?.trim(), `${game.id}: Hindi titles need an English gloss for search`);
      }
      assert.equal(new Set(games.map((g) => g.title)).size, 10, `class ${classLevel} ${subject}: titles must be unique`);
    }
  }
});

for (const classLevel of CLASS_LEVELS) {
  for (const subject of SUBJECTS) {
    test(`class ${classLevel} ${subject}: every game is complete and correct`, () => {
      const content = CONTENT[classLevel][subject];
      const slots = TEMPLATES[subject].map((t) => t.slot);
      assert.deepEqual(Object.keys(content).sort(), slots.slice().sort(), `class ${classLevel} ${subject}: exactly the 10 game slots`);

      for (const template of TEMPLATES[subject]) {
        const game = content[template.slot];
        const at = where(classLevel, subject, template.slot);
        assert.ok(game.learn.trim().length > 0, `${at}: learn must be set`);

        const allowed = ENGINE_KINDS[template.engine];
        game.questions.forEach((q, i) => {
          assert.ok(allowed.includes(q.kind), `${where(classLevel, subject, template.slot, i)}: ${q.kind} cannot be played by ${template.engine}`);
          checkQuestion(q, template.engine, where(classLevel, subject, template.slot, i));
        });

        const keys = game.questions.map((q) => JSON.stringify(q));
        assert.equal(new Set(keys).size, keys.length, `${at}: duplicate question`);

        if (game.generator) {
          for (const q of generateQuestions(game.generator, template.engine, 30, seeded(7))) {
            assert.ok(allowed.includes(q.kind), `${at}: generator makes ${q.kind}, which ${template.engine} cannot play`);
            checkQuestion(q, template.engine, `${at} (generated)`);
          }
        } else {
          // A pool bigger than one session, so replays are not identical.
          assert.ok(sessionPoints(game.questions) >= SESSION_TARGET + 2, `${at}: pool worth ${sessionPoints(game.questions)} points; need at least ${SESSION_TARGET + 2}`);
        }

        for (let seed = 1; seed <= 40; seed++) {
          const session = buildSession(template.engine, game, seeded(seed));
          assert.ok(sessionPoints(session) >= SESSION_TARGET, `${at}: session only worth ${sessionPoints(session)} points`);
        }
      }
    });
  }
}

test('typed answers compare sensibly', () => {
  assert.ok(sameNumber(' 12 ', '12'));
  assert.ok(sameNumber('2.50', '2.5'));
  assert.ok(sameNumber('1,245', '1245'));
  assert.ok(sameNumber('3/4', '3/4'));
  assert.ok(!sameNumber('0.75', '3/4'));
  assert.ok(!sameNumber('', '0'));
});
