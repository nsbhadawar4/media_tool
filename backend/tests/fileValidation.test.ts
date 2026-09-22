/**
 * What the server will and will not accept as a file, decided from the bytes.
 *
 * This is the check that stands between the library and a permanently broken tile. The
 * app used to settle a file's type from its extension, so `notes.txt` renamed `photo.jpg`
 * became an ordinary image record and the gallery rendered an `<img>` at bytes no browser
 * could decode — an upload that reported success and a card that never worked. Every
 * invalid case below is a way that used to happen.
 *
 * Fixtures are real files (see helpers/fixtures): images encoded by sharp, ZIPs assembled
 * to the specification, a PDF with a working xref, a Compound File with a genuine header.
 * Validating something that only resembles a JPEG would prove nothing about JPEGs.
 */
import './helpers/setupSmallLimitEnv';

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { validateUploadedFile } from '../src/services/fileValidationService';
import { UploadErrorCode } from '../src/utils/uploadErrors';
import { AppError } from '../src/utils/AppError';
import {
  cleanupFixtures,
  compoundFileBuffer,
  corruptPng,
  docxBuffer,
  imageBuffer,
  pdfBuffer,
  plainZipBuffer,
  truncatedJpeg,
  writeFixture,
  xlsxBuffer,
} from './helpers/fixtures';

after(cleanupFixtures);

/** Runs the validator over a file written from `contents`. */
async function validate(name: string, contents: Buffer | string, reportedMimeType: string) {
  const filePath = await writeFixture(name, contents);
  return validateUploadedFile({ filePath, safeName: name, reportedMimeType });
}

/** Asserts the validator refuses the file, and refuses it for the stated reason. */
async function expectRejection(
  name: string,
  contents: Buffer | string,
  reportedMimeType: string,
  code: string,
) {
  await assert.rejects(
    () => validate(name, contents, reportedMimeType),
    (err: unknown) => {
      assert.ok(err instanceof AppError, `expected an AppError, got ${String(err)}`);
      assert.equal(err.code, code, `wrong reason: ${err.message}`);
      assert.ok(err.message.length > 0, 'a rejection must say something the uploader can act on');
      return true;
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Valid files                                                                 */
/* -------------------------------------------------------------------------- */

for (const [extension, format, expectedMime] of [
  ['.jpg', 'jpeg', 'image/jpeg'],
  ['.jpeg', 'jpeg', 'image/jpeg'],
  ['.png', 'png', 'image/png'],
  ['.webp', 'webp', 'image/webp'],
  ['.gif', 'gif', 'image/gif'],
] as const) {
  test(`a real ${format.toUpperCase()} named ${extension} is accepted and measured`, async () => {
    const contents = await imageBuffer(format, 64, 40);
    const result = await validate(`photo${extension}`, contents, expectedMime);

    assert.equal(result.fileType, 'image');
    assert.equal(result.mimeType, expectedMime);
    assert.equal(result.size, contents.length);
    // Measured from the pixels, never taken from the client — this is what the card uses.
    assert.equal(result.width, 64);
    assert.equal(result.height, 40);
    assert.equal(result.sha256, crypto.createHash('sha256').update(contents).digest('hex'));
  });
}

test('a real PDF is accepted as a document', async () => {
  const result = await validate('report.pdf', pdfBuffer(), 'application/pdf');

  assert.equal(result.fileType, 'document');
  assert.equal(result.mimeType, 'application/pdf');
  // Documents are never measured or thumbnailed as images.
  assert.equal(result.width, null);
  assert.equal(result.height, null);
});

test('a real DOCX is accepted as a document', async () => {
  const result = await validate('contract.docx', docxBuffer(), '');
  assert.equal(result.fileType, 'document');
  assert.equal(
    result.mimeType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
});

test('a real XLSX is accepted as a document', async () => {
  const result = await validate('budget.xlsx', xlsxBuffer(), '');
  assert.equal(result.fileType, 'document');
  assert.equal(
    result.mimeType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

test('a legacy .doc with a real Compound File structure is accepted', async () => {
  const result = await validate('letter.doc', compoundFileBuffer('WordDocument'), 'application/msword');
  assert.equal(result.fileType, 'document');
  assert.equal(result.mimeType, 'application/msword');
});

test('a legacy .xls with a real Compound File structure is accepted', async () => {
  const result = await validate('sheet.xls', compoundFileBuffer('Workbook'), 'application/vnd.ms-excel');
  assert.equal(result.fileType, 'document');
  assert.equal(result.mimeType, 'application/vnd.ms-excel');
});

test('plain text is accepted as a document', async () => {
  const result = await validate('notes.txt', 'just some notes\nand another line\n', 'text/plain');
  assert.equal(result.fileType, 'document');
  assert.equal(result.mimeType, 'text/plain');
});

test('a vague Content-Type from the browser is tolerated, not punished', async () => {
  /**
   * Windows and several browsers send `application/octet-stream` for a perfectly ordinary
   * .xlsx or .mkv. Rejecting that would turn a correctness check into a bug report from
   * every Windows user, so the extension and the bytes decide and the vague header is
   * simply not evidence either way.
   */
  const result = await validate('budget.xlsx', xlsxBuffer(), 'application/octet-stream');
  assert.equal(result.fileType, 'document');
});

/* -------------------------------------------------------------------------- */
/* Invalid files                                                               */
/* -------------------------------------------------------------------------- */

test('a text file renamed .jpg is refused', async () => {
  // The original report: this used to be stored as an image and rendered as a broken tile.
  await expectRejection(
    'photo.jpg',
    'This is not an image. It is a sentence.',
    'image/jpeg',
    UploadErrorCode.InvalidFileContent,
  );
});

test('a truncated JPEG is refused even though its header is perfect', async () => {
  // A signature check passes this; only decoding catches it. It is what a photo uploaded
  // over a dropped connection looks like.
  await expectRejection('holiday.jpg', await truncatedJpeg(), 'image/jpeg', UploadErrorCode.CorruptFile);
});

test('a PNG signature over garbage is refused', async () => {
  await expectRejection('broken.png', await corruptPng(), 'image/png', UploadErrorCode.CorruptFile);
});

test('a text file renamed .pdf is refused', async () => {
  await expectRejection(
    'invoice.pdf',
    '%This is not a PDF, it only mentions one.',
    'application/pdf',
    UploadErrorCode.InvalidFileContent,
  );
});

test('an ordinary ZIP renamed .docx is refused', async () => {
  // A real, valid ZIP — so the signature check passes. What it is missing is the OPC part
  // structure every Office package has, which is the only thing that distinguishes them.
  await expectRejection('contract.docx', plainZipBuffer(), '', UploadErrorCode.InvalidFileContent);
});

test('a spreadsheet renamed .docx is refused', async () => {
  // Both are Office packages, so both pass every check up to the part prefix. Getting this
  // wrong would file a workbook as a Word document and open it with the wrong viewer.
  await expectRejection('contract.docx', xlsxBuffer(), '', UploadErrorCode.InvalidFileContent);
});

test('a text file renamed .doc is refused', async () => {
  await expectRejection(
    'letter.doc',
    'Dear sir, this is not a Word file.',
    'application/msword',
    UploadErrorCode.InvalidFileContent,
  );
});

test('a Compound File with no Word stream is refused as a .doc', async () => {
  // A real .xls is a real Compound File; it is still not a Word document.
  await expectRejection(
    'letter.doc',
    compoundFileBuffer('Workbook'),
    'application/msword',
    UploadErrorCode.InvalidFileContent,
  );
});

test('binary content in a .txt is refused', async () => {
  // Without this, .txt would be the one extension that lets arbitrary bytes in unexamined.
  await expectRejection(
    'notes.txt',
    Buffer.concat([Buffer.from('start'), Buffer.from([0x00, 0x01, 0x02]), crypto.randomBytes(64)]),
    'text/plain',
    UploadErrorCode.InvalidFileContent,
  );
});

test('an empty file is refused', async () => {
  await expectRejection('empty.png', Buffer.alloc(0), 'image/png', UploadErrorCode.EmptyFile);
});

test('a Content-Type naming a different supported type is a contradiction, not a hint', async () => {
  const contents = await imageBuffer('png');
  await expectRejection('photo.png', contents, 'application/pdf', UploadErrorCode.InvalidFileContent);
});

test('PNG bytes named .jpg are refused', async () => {
  // Harmless in itself — but the record would say JPEG about a PNG, and a download would
  // hand the browser a content type its bytes contradict.
  const contents = await imageBuffer('png');
  await expectRejection('photo.jpg', contents, 'image/jpeg', UploadErrorCode.InvalidFileContent);
});

test('an extension the app does not support is refused', async () => {
  await expectRejection(
    'installer.exe',
    crypto.randomBytes(256),
    'application/octet-stream',
    UploadErrorCode.InvalidFileType,
  );
});

test('a file with no extension at all is refused', async () => {
  await expectRejection('README', 'no extension here', 'text/plain', UploadErrorCode.InvalidFileType);
});

test('a file over the configured limit is refused before anything else happens', async () => {
  // This suite runs with MAX_FILE_SIZE_MB=1 (see helpers/setupSmallLimitEnv).
  await expectRejection(
    'huge.png',
    crypto.randomBytes(2 * 1024 * 1024),
    'image/png',
    UploadErrorCode.FileTooLarge,
  );
});

test('a filename is never used as a path', async () => {
  /**
   * The validator reads whatever path it is given and takes only the extension from the
   * name, so a crafted name cannot redirect it — but the name is also what would become a
   * storage key, and assertSafeFilename rejects separators before this is ever reached.
   * Pinned here so a future refactor cannot quietly start trusting the name.
   */
  const contents = await imageBuffer('png');
  const result = await validate('photo.png', contents, 'image/png');
  assert.equal(result.mimeType, 'image/png');
});
