/**
 * Adds varied, validated practice to every Class 1 Mathematics lesson (see services/curriculum/mathBank.ts).
 * Existing questions are kept; new ones are appended. Nothing is written unless --apply is given.
 *
 * Usage:
 *   npm run expand-class1-math                      dry run: reports what would change
 *   npm run expand-class1-math -- --apply           backs the lessons up to backend/tmp, then writes
 *   npm run expand-class1-math -- --restore <file>  puts a backup's questions/practice/minutes back
 *
 * The database is MONGODB_URI (a sandbox copy can be targeted by setting it on the command line).
 * The public catalog is cached by the running backend: restart it (or wait) to see changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Course } from '../models/Course';
import { expandChapter } from '../services/curriculum/mathExpand';

const args = process.argv.slice(2);
const restoreIdx = args.indexOf('--restore');
const apply = args.includes('--apply');

async function main() {
  await connectDatabase();
  try {
    if (restoreIdx >= 0) return await restore(args[restoreIdx + 1]);
    const docs = await Course.find({ classLevel: 1, subject: 'math', archivedAt: null, trashedAt: null }).sort({ order: 1 });
    const backup: unknown[] = [];
    let added = 0;
    const byKind: Record<string, number> = {};
    for (const doc of docs) {
      const res = expandChapter({ order: doc.order, title: doc.title, slug: doc.slug, lessons: doc.lessons.map((l) => ({ title: l.title, questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes })) });
      if (res.status === 'skipped') {
        console.log(`skip  ${doc.order} ${doc.title}: ${res.reason}`);
        continue;
      }
      const n = res.lessons.reduce((s, l) => s + l.added.length, 0);
      for (const l of res.lessons) for (const q of l.added) byKind[q.kind] = (byKind[q.kind] ?? 0) + 1;
      console.log(`${apply ? 'write' : 'would'} ${doc.order} ${doc.title}: +${n} questions`);
      if (!n) continue;
      added += n;
      backup.push({ _id: String(doc._id), order: doc.order, estimatedMinutes: doc.estimatedMinutes, lessons: doc.lessons.map((l) => ({ questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes })) });
      if (apply) {
        const before = doc.lessons.reduce((s, l) => s + (l.estimatedMinutes ?? 0), 0);
        res.lessons.forEach((l, i) => {
          doc.lessons[i]!.questions = l.questions as never;
          doc.lessons[i]!.practice = l.practice as never;
          doc.lessons[i]!.estimatedMinutes = l.estimatedMinutes;
        });
        const after = res.lessons.reduce((s, l) => s + l.estimatedMinutes, 0);
        doc.estimatedMinutes = (doc.estimatedMinutes ?? before) + (after - before);
      }
    }
    console.log(`\n${added} questions ${apply ? 'added' : 'would be added'} across ${backup.length} chapters`);
    console.log('by kind:', byKind);
    if (apply && backup.length) {
      const file = path.resolve(__dirname, '../../tmp', `class1-math-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(file, JSON.stringify(backup));
      console.log(`backup: ${file}`);
      for (const doc of docs) if (doc.isModified()) await doc.save();
      console.log('saved.');
    } else if (!apply) console.log('dry run: nothing was written. Re-run with --apply to save.');
  } finally {
    await disconnectDatabase();
  }
}

async function restore(file?: string) {
  if (!file) throw new Error('--restore needs a backup file');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ _id: string; estimatedMinutes: number | null; lessons: Array<{ questions: unknown[]; practice: unknown[]; estimatedMinutes: number | null }> }>;
  for (const s of saved) {
    const doc = await Course.findById(s._id);
    if (!doc || doc.lessons.length !== s.lessons.length) {
      console.log(`skip ${s._id}: changed since the backup`);
      continue;
    }
    s.lessons.forEach((l, i) => {
      doc.lessons[i]!.questions = l.questions as never;
      doc.lessons[i]!.practice = l.practice as never;
      doc.lessons[i]!.estimatedMinutes = l.estimatedMinutes;
    });
    doc.estimatedMinutes = s.estimatedMinutes;
    await doc.save();
    console.log(`restored chapter ${doc.order} ${doc.title}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
