/**
 * The rules the browser applies to a selection before anything is uploaded.
 *
 * These are advisory by design — the server enforces the same separation against the bytes
 * (backend/tests/uploadCategory.test.ts), and it has to, because `accept` is a hint every
 * file dialog lets people override and drag-and-drop ignores entirely. What is tested here
 * is the promise this layer does make: that choosing the wrong kind of file says so at
 * once, and that a selection is never half-uploaded.
 *
 * Pure functions only. The repository has no component-test harness and this does not add
 * one; what a card renders is covered from the server side instead, by asserting that a
 * document is never given a thumbnail URL for a card to draw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptFor, checkBatch } from '../utils/uploadAccept';

/** A stand-in for a picked file: only the name and type are ever read. */
function picked(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

const PNG = picked('holiday.png', 'image/png');
const JPEG = picked('holiday.jpg', 'image/jpeg');
const PDF = picked('report.pdf', 'application/pdf');
const DOCX = picked(
  'contract.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
const MP4 = picked('clip.mp4', 'video/mp4');

test('the documents picker offers document extensions and no image ones', () => {
  const accept = acceptFor('document');

  for (const extension of ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']) {
    assert.ok(accept.includes(extension), `${extension} should be offered`);
  }
  for (const extension of ['.png', '.jpg', '.webp', '.gif']) {
    assert.ok(!accept.includes(extension), `${extension} should not be offered`);
  }
});

test('the media picker offers photos and videos, and no documents', () => {
  const accept = acceptFor('media');

  for (const extension of ['.jpg', '.png', '.webp', '.gif', '.mp4', '.mov']) {
    assert.ok(accept.includes(extension), `${extension} should be offered`);
  }
  for (const extension of ['.pdf', '.docx', '.xlsx', '.txt']) {
    assert.ok(!accept.includes(extension), `${extension} should not be offered`);
  }
});

test('an unrestricted picker offers everything the library accepts', () => {
  const accept = acceptFor();
  assert.ok(accept.includes('.png'));
  assert.ok(accept.includes('.pdf'));
  assert.ok(accept.includes('.mp4'));
});

test('documents are accepted by the documents upload', () => {
  assert.deepEqual(checkBatch([PDF, DOCX], 'document'), { ok: true });
});

test('an image offered to the documents upload is refused, by name', () => {
  const verdict = checkBatch([PNG], 'document');

  assert.equal(verdict.ok, false);
  assert.equal(verdict.message, 'Upload cancelled: Documents only. Images are not allowed.');
});

test('a mixed selection is refused whole, not uploaded in part', () => {
  /**
   * The behaviour asked for, and the reason for it: dropping the two images and uploading
   * the PDF would leave someone believing three files arrived. One action, one outcome.
   */
  const verdict = checkBatch([JPEG, PDF, PNG], 'document');

  assert.equal(verdict.ok, false);
  assert.match(verdict.message!, /Upload cancelled/);
});

test('a document offered to the image upload is refused, by name', () => {
  const verdict = checkBatch([PDF], 'image');

  assert.equal(verdict.ok, false);
  assert.equal(
    verdict.message,
    'Upload cancelled: Documents are not allowed here. Please upload an image.',
  );
});

test('the media upload takes photos and videos together', () => {
  // The Media page holds both, so narrowing it to images would have removed video upload.
  assert.deepEqual(checkBatch([PNG, MP4], 'media'), { ok: true });
});

test('a document is still refused by the media upload', () => {
  assert.equal(checkBatch([MP4, DOCX], 'media').ok, false);
});

test('an upload with no category accepts anything, as the dashboard does', () => {
  assert.deepEqual(checkBatch([PNG, PDF, MP4]), { ok: true });
});

test('a renamed file is judged by more than its extension', () => {
  // A picker that reports `image/png` for something called `.pdf` has said something worth
  // acting on. It is still only a hint — the server reads the bytes — but it is free.
  const disguised = picked('report.pdf', 'image/png');
  assert.equal(checkBatch([disguised], 'document').ok, false);
});

test('an unrecognisable file is left for the server to judge', () => {
  /**
   * No extension the app knows and no type from the browser: this layer genuinely cannot
   * tell, and guessing would reject files that are perfectly fine. The server can tell,
   * because it reads them.
   */
  const unknown = picked('archive', '');
  assert.deepEqual(checkBatch([unknown], 'document'), { ok: true });
});

test('an empty selection is not an error', () => {
  assert.deepEqual(checkBatch([], 'document'), { ok: true });
});
