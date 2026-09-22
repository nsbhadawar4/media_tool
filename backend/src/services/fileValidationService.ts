import path from 'node:path';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import sharp, { type Metadata } from 'sharp';
import {
  ALLOWED_MIME_TYPES,
  EXTENSION_TO_MIME,
  FILE_TYPES_BY_UPLOAD_CATEGORY,
  fileTypeFromMime,
  type FileType,
  type UploadCategory,
} from '../config/constants';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { UploadErrorCode } from '../utils/uploadErrors';

/**
 * The single place that decides whether an uploaded file is what it claims to be.
 *
 * Everything upstream of this is a claim, not a fact. The extension is chosen by whoever
 * named the file, the browser's Content-Type is derived from that same extension on most
 * platforms, and multer will happily write any bytes to disk under any name. The app used
 * to settle a file's type from the extension alone — so `notes.txt` renamed to `photo.jpg`
 * became a perfectly ordinary image record, and the gallery rendered an `<img>` at it that
 * no browser could decode. The upload said it succeeded; the card was broken forever.
 *
 * So this reads the bytes. Extension, reported type and actual content all have to agree
 * before a file is allowed in, and for images "agree" means the pixels genuinely decode —
 * a truncated JPEG has a perfect JPEG header.
 *
 * Both upload paths call it: through the API, and direct-to-bucket after the object is
 * pulled back. Neither can drift into accepting something the other would reject.
 */

/**
 * sharp keeps recently-read files in an operation cache, and a cached handle is an open
 * handle — which Windows will not let anything unlink. This module reads every uploaded
 * image, and the upload pipeline deletes that temp file immediately afterwards, so a
 * cached handle here means an orphaned temp file for every single upload on a developer's
 * machine. thumbnailService sets the same flag for the same reason; it is process-wide and
 * idempotent, and stating it in both places is what keeps either from depending on the
 * other having been imported first.
 */
sharp.cache(false);

/** How much of the head is kept for signature checks. Every signature here is far shorter. */
const HEAD_BYTES = 4096;

/** Bounds on the ZIP directory an Office document may carry — see readZipEntryNames. */
const MAX_ZIP_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 20_000;

/** Largest tail a ZIP end-of-central-directory record can be found in: 22 + a 64 KB comment. */
const ZIP_EOCD_SEARCH_BYTES = 22 + 0xffff;

/** A width or height beyond this is a decoder bomb rather than a photograph. */
const MAX_IMAGE_DIMENSION = 40_000;

export interface ValidatedFile {
  /** Authoritative type, settled from content and extension agreeing — never the client's. */
  mimeType: string;
  fileType: FileType;
  size: number;
  /** Of the bytes as they were read here, so storage can be checked against it afterwards. */
  sha256: string;
  /** Measured for images, null otherwise. Never the client's claim. */
  width: number | null;
  height: number | null;
}

function invalid(code: UploadErrorCode, message: string): AppError {
  return AppError.badRequest(message, undefined, code);
}

/* -------------------------------------------------------------------------- */
/* Signatures                                                                  */
/* -------------------------------------------------------------------------- */

function startsWith(head: Buffer, bytes: readonly number[]): boolean {
  if (head.length < bytes.length) return false;
  return bytes.every((byte, index) => head[index] === byte);
}

function asciiAt(head: Buffer, offset: number, length: number): string {
  return head.subarray(offset, offset + length).toString('latin1');
}

/**
 * ISO base media format — MP4, MOV, HEIC and HEIF are all this container, distinguished
 * only by the brand at offset 8. Reading the brand is what keeps a .mp4 from being
 * accepted as a .heic and vice versa.
 */
function isoBrand(head: Buffer): string | null {
  if (head.length < 12) return null;
  if (asciiAt(head, 4, 4) !== 'ftyp') return null;
  return asciiAt(head, 8, 4).trim().toLowerCase();
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'avc1', 'mp41', 'mp42', 'mmp4', 'm4v', 'dash', 'nvr1']);

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;
/** Microsoft Compound File Binary — the container behind legacy .doc and .xls. */
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

/** Whether the head looks like the container the given mime type is carried in. */
function signatureMatches(mimeType: string, head: Buffer): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP';
    case 'image/gif':
      return asciiAt(head, 0, 6) === 'GIF87a' || asciiAt(head, 0, 6) === 'GIF89a';
    case 'image/heic':
    case 'image/heif': {
      const brand = isoBrand(head);
      return brand !== null && HEIF_BRANDS.has(brand);
    }
    case 'video/mp4': {
      const brand = isoBrand(head);
      return brand !== null && MP4_BRANDS.has(brand);
    }
    case 'video/quicktime': {
      // QuickTime is usually branded `qt  `, but a bare `moov`/`mdat`/`free` atom at the
      // start is also a legitimate .mov with no ftyp box at all.
      const brand = isoBrand(head);
      if (brand === 'qt') return true;
      const atom = asciiAt(head, 4, 4);
      return atom === 'moov' || atom === 'mdat' || atom === 'free' || atom === 'wide';
    }
    case 'video/webm':
    case 'video/x-matroska':
      // Both are EBML. Telling them apart means parsing the DocType element, which decides
      // nothing here: they are stored and streamed identically, and the extension already
      // settled which of the two names the file carries.
      return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'application/pdf':
      // The spec allows leading junk before %PDF-, and readers tolerate it, but nothing
      // that writes a PDF produces it — and accepting it would let a file be both a valid
      // something-else and a "PDF".
      return asciiAt(head, 0, 5) === '%PDF-';
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith(head, CFB_SIGNATURE);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(head, ZIP_LOCAL_HEADER);
    case 'text/plain':
      // No signature exists; judged by content in assertPlainText instead.
      return true;
    default:
      return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Container-level checks                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Entry names from a ZIP's central directory.
 *
 * Only the directory is read — never an entry's contents — so a compression bomb has
 * nothing to expand here, and the two bounds below cap what a malformed file can make
 * this allocate. An archive whose directory cannot be found or parsed is reported as
 * unreadable rather than waved through: this is the only evidence that a `.docx` is an
 * Office document and not a renamed archive, so failing to read it is a rejection.
 */
async function readZipEntryNames(filePath: string, size: number): Promise<string[]> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const tailLength = Math.min(size, ZIP_EOCD_SEARCH_BYTES);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) return [];

    const entryCount = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);

    if (
      entryCount === 0 ||
      entryCount > MAX_ZIP_ENTRIES ||
      directorySize === 0 ||
      directorySize > MAX_ZIP_DIRECTORY_BYTES ||
      directoryOffset + directorySize > size
    ) {
      return [];
    }

    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);

    const names: string[] = [];
    let cursor = 0;
    while (cursor + 46 <= directory.length && names.length < entryCount) {
      if (directory.readUInt32LE(cursor) !== 0x02014b50) break;
      const nameLength = directory.readUInt16LE(cursor + 28);
      const extraLength = directory.readUInt16LE(cursor + 30);
      const commentLength = directory.readUInt16LE(cursor + 32);
      names.push(directory.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'));
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return names;
  } finally {
    await handle.close();
  }
}

/**
 * An Office Open XML package, rather than any ZIP that has been given an Office extension.
 *
 * `[Content_Types].xml` is required at the root of every OPC package, and the part prefix
 * says which application wrote it. A renamed .zip has neither, which is exactly the file
 * this check exists to turn away.
 */
async function assertOoxmlPackage(filePath: string, size: number, mimeType: string): Promise<void> {
  const names = await readZipEntryNames(filePath, size);
  if (names.length === 0) {
    throw invalid(
      UploadErrorCode.CorruptFile,
      'This Office document could not be read. It may be incomplete or corrupt.',
    );
  }

  if (!names.includes('[Content_Types].xml')) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      'This file is a ZIP archive, not an Office document. Rename it to .zip or upload the real document.',
    );
  }

  const isWord = mimeType.endsWith('wordprocessingml.document');
  const expectedPrefix = isWord ? 'word/' : 'xl/';
  if (!names.some((name) => name.startsWith(expectedPrefix))) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      isWord
        ? 'This is not a Word document. Check the file extension matches its contents.'
        : 'This is not an Excel workbook. Check the file extension matches its contents.',
    );
  }
}

/**
 * A legacy Office binary, rather than anything else carrying its magic number.
 *
 * The Compound File header is checked for internal consistency, then the stream that
 * identifies the application is looked for by name. Directory entry names are UTF-16LE
 * inside the container, so they are searched for in that encoding — a substring match
 * rather than a full directory walk, which would mean implementing the FAT chain to find
 * an answer this already gives. What it cannot do is pass a file that is not a Compound
 * File at all, which is the case that produced broken documents.
 */
async function assertLegacyOfficeFile(filePath: string, mimeType: string): Promise<void> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const header = Buffer.alloc(512);
    const { bytesRead } = await handle.read(header, 0, 512, 0);
    if (bytesRead < 512) {
      throw invalid(UploadErrorCode.CorruptFile, 'This document is too short to be a valid Office file.');
    }

    const sectorShift = header.readUInt16LE(30);
    const firstDirectorySector = header.readUInt32LE(48);
    // 512-byte and 4096-byte sectors are the only two the format defines.
    if ((sectorShift !== 9 && sectorShift !== 12) || firstDirectorySector === 0xffffffff) {
      throw invalid(UploadErrorCode.CorruptFile, 'This Office document has an unreadable structure.');
    }

    // Bounded: the directory of a real document sits well inside this, and the cap is what
    // keeps a hostile file from making this read hundreds of megabytes looking for a name.
    const scanLength = Math.min((await handle.stat()).size, 8 * 1024 * 1024);
    const scan = Buffer.alloc(scanLength);
    await handle.read(scan, 0, scanLength, 0);

    const isWord = mimeType === 'application/msword';
    const streamName = Buffer.from(isWord ? 'WordDocument' : 'Workbook', 'utf16le');
    const alternate = isWord ? null : Buffer.from('Book', 'utf16le');

    const found = scan.includes(streamName) || (alternate !== null && scan.includes(alternate));
    if (!found) {
      throw invalid(
        UploadErrorCode.InvalidFileContent,
        isWord
          ? 'This is not a Word document. Check the file extension matches its contents.'
          : 'This is not an Excel workbook. Check the file extension matches its contents.',
      );
    }
  } finally {
    await handle.close();
  }
}

/**
 * How much of the tail is searched for a PDF's end marker. Readers look in the last 1 KB;
 * this is generous enough for the trailing whitespace some producers leave behind.
 */
const PDF_TAIL_BYTES = 2048;

/**
 * A PDF that is actually complete, not merely one that begins like a PDF.
 *
 * `%PDF-` is five bytes, and five bytes is not a document: a text file whose first line
 * says `%PDF-1.4` passes a signature check, and so does a real PDF whose download was cut
 * off halfway. Both are accepted by every check up to this point and unreadable by every
 * viewer after it.
 *
 * Structure is what separates them. A conforming file ends with the cross-reference
 * pointer and the `%%EOF` marker, in that order, and a file missing them is either
 * truncated or never was one — which is the whole question being asked here.
 */
async function assertPdfStructure(filePath: string, size: number): Promise<void> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const length = Math.min(size, PDF_TAIL_BYTES);
    const tail = Buffer.alloc(length);
    await handle.read(tail, 0, length, size - length);
    const text = tail.toString('latin1');

    if (!text.includes('%%EOF')) {
      throw invalid(
        UploadErrorCode.CorruptFile,
        'This PDF is incomplete — it has no end-of-file marker. It may have been truncated.',
      );
    }
    if (!text.includes('startxref')) {
      throw invalid(
        UploadErrorCode.InvalidFileContent,
        'This file starts like a PDF but has no cross-reference table, so it is not a readable PDF.',
      );
    }
  } finally {
    await handle.close();
  }
}

/**
 * Plain text, judged the way every file manager judges it: by the absence of binary.
 *
 * There is no signature to check, so without this a `.txt` extension would be the one way
 * to get arbitrary bytes into the library unexamined.
 */
function assertPlainText(head: Buffer): void {
  if (head.includes(0)) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      'This file contains binary data, so it is not a text file.',
    );
  }
}

/**
 * Longest edge the decode probe below renders to.
 *
 * Small enough that the probe costs almost nothing — for JPEG and WebP libvips shrinks on
 * load, so it never materialises the full-size raster — and large enough that the decoder
 * still has to walk the entire image to produce it, which is the part that matters.
 */
const DECODE_PROBE_EDGE = 64;

/**
 * The image genuinely decodes, at a plausible size.
 *
 * Reading the header is not enough, and that gap is the whole reason this function is not
 * a one-liner: `metadata()` parses the first few bytes and answers happily for a JPEG
 * whose pixel data stops a third of the way through — the exact shape of a photo uploaded
 * over a connection that dropped. Every check short of actually rendering the thing
 * accepts it, and the gallery then serves a tile no browser can draw.
 *
 * So the image is decoded. At reduced size, because what is being established is that the
 * pixels are all there and readable, not what they look like.
 */
async function measureImage(filePath: string): Promise<{ width: number; height: number }> {
  let metadata: Metadata;
  try {
    // Default `failOn` is sharp's strictest ('warning'); naming a laxer level here would
    // quietly accept images libvips is already suspicious of.
    metadata = await sharp(filePath).metadata();
  } catch {
    throw invalid(
      UploadErrorCode.CorruptFile,
      'This image could not be read. It may be incomplete, corrupt, or in a format this server cannot process.',
    );
  }

  const { width, height } = metadata;
  if (!width || !height || width < 1 || height < 1) {
    throw invalid(UploadErrorCode.CorruptFile, 'This image has no readable dimensions.');
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      `This image is ${width}×${height}, which is too large to process.`,
    );
  }

  try {
    await sharp(filePath).resize(DECODE_PROBE_EDGE, DECODE_PROBE_EDGE, { fit: 'inside' }).toBuffer();
  } catch {
    throw invalid(
      UploadErrorCode.CorruptFile,
      'This image is incomplete or damaged and could not be displayed, so it was not saved.',
    );
  }

  return { width, height };
}

/* -------------------------------------------------------------------------- */

/** Reads the whole file once: hashes every byte, and keeps the head for signature checks. */
async function digestAndHead(filePath: string): Promise<{ sha256: string; head: Buffer }> {
  const hash = createHash('sha256');
  const headChunks: Buffer[] = [];
  let headLength = 0;

  for await (const chunk of createReadStream(filePath)) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    if (headLength < HEAD_BYTES) {
      headChunks.push(buffer.subarray(0, HEAD_BYTES - headLength));
      headLength += Math.min(buffer.length, HEAD_BYTES - headLength);
    }
  }

  return { sha256: hash.digest('hex'), head: Buffer.concat(headChunks) };
}

/**
 * Enforces that a file belongs where it was uploaded.
 *
 * The server cannot infer this from the file — a JPEG is a perfectly valid JPEG wherever
 * it arrives. It comes from the request saying which upload it is, and it has to be
 * enforced here rather than trusted from the client, because the client stating its own
 * constraint is not a constraint at all: the Documents page and the Media page post to the
 * same endpoint, and anything that can post to one can post to the other.
 *
 * Called with the *validated* type, never the claimed one, so renaming a file cannot move
 * it between categories either.
 */
export function assertUploadCategory(
  category: UploadCategory | undefined,
  fileType: FileType,
  fileName: string,
): void {
  // No category means an upload with no such constraint — the dashboard and the folder
  // pages take anything the library accepts, and always have.
  if (!category) return;

  const allowed = FILE_TYPES_BY_UPLOAD_CATEGORY[category];
  if (allowed.includes(fileType)) return;

  const message =
    category === 'document'
      ? 'Images are not allowed here. Please upload documents only.'
      : fileType === 'document'
        ? 'Documents are not allowed here. Please upload an image.'
        : `"${fileName}" is a ${fileType} file, which cannot be uploaded here.`;

  throw invalid(UploadErrorCode.WrongUploadCategory, message);
}

export interface ValidateUploadedFileInput {
  filePath: string;
  /** Already through assertSafeFilename; used only for its extension. */
  safeName: string;
  /** What the client said it was. Corroborating evidence at most — never the deciding vote. */
  reportedMimeType: string;
}

/**
 * Settles what a file is, or refuses it.
 *
 * Returns the type the rest of the pipeline must use. Callers must not fall back to the
 * extension or the client's mime type afterwards — that fallback is the bug this exists
 * to close.
 */
export async function validateUploadedFile(input: ValidateUploadedFileInput): Promise<ValidatedFile> {
  const { filePath, safeName, reportedMimeType } = input;

  let size: number;
  try {
    size = (await fsp.stat(filePath)).size;
  } catch {
    throw invalid(UploadErrorCode.CorruptFile, 'The uploaded file could not be read.');
  }

  if (size === 0) {
    throw invalid(UploadErrorCode.EmptyFile, 'This file is empty.');
  }
  if (size > env.maxFileSizeBytes) {
    throw AppError.tooLarge(
      `Files must be ${env.MAX_FILE_SIZE_MB} MB or smaller`,
      UploadErrorCode.FileTooLarge,
    );
  }

  const extension = path.extname(safeName).toLowerCase();
  const mimeType = EXTENSION_TO_MIME[extension];
  if (!mimeType) {
    throw invalid(
      UploadErrorCode.InvalidFileType,
      `Files ending in ${extension || '(no extension)'} are not supported.`,
    );
  }

  const fileType = fileTypeFromMime(mimeType);
  if (!fileType) {
    throw invalid(UploadErrorCode.InvalidFileType, `${extension} files are not supported.`);
  }

  /**
   * The client's mime type is allowed to be vague but not to be wrong. Windows and several
   * browsers report `application/octet-stream` for a perfectly ordinary .xlsx or .mkv, so
   * refusing that would reject real files; a header that names a *different* supported
   * type is a genuine contradiction and there is no honest way to resolve it.
   */
  const reported = reportedMimeType.trim().toLowerCase();
  if (
    reported &&
    reported !== mimeType &&
    reported !== 'application/octet-stream' &&
    (ALLOWED_MIME_TYPES as readonly string[]).includes(reported)
  ) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      `This file is named ${extension} but was sent as ${reported}. Rename it to match its actual type.`,
    );
  }

  const { sha256, head } = await digestAndHead(filePath);

  if (!signatureMatches(mimeType, head)) {
    throw invalid(
      UploadErrorCode.InvalidFileContent,
      `This file is not a valid ${extension.replace('.', '').toUpperCase()} file. Its contents do not match its extension.`,
    );
  }

  let width: number | null = null;
  let height: number | null = null;

  switch (mimeType) {
    case 'application/pdf':
      await assertPdfStructure(filePath, size);
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      await assertOoxmlPackage(filePath, size, mimeType);
      break;
    case 'application/msword':
    case 'application/vnd.ms-excel':
      await assertLegacyOfficeFile(filePath, mimeType);
      break;
    case 'text/plain':
      assertPlainText(head);
      break;
    default:
      break;
  }

  if (fileType === 'image') {
    ({ width, height } = await measureImage(filePath));
  }

  return { mimeType, fileType, size, sha256, width, height };
}

/**
 * The same decision, for bytes that are already in storage.
 *
 * A direct-to-bucket upload never passes through this server, so its only chance to be
 * examined is after the fact, against a copy pulled back out. Identical rules on purpose:
 * which files are acceptable must not depend on how they were uploaded.
 */
export async function validateStoredCopy(input: ValidateUploadedFileInput): Promise<ValidatedFile> {
  return validateUploadedFile(input);
}
