/**
 * Real files for the upload tests.
 *
 * Every fixture here is built to the actual format, not stubbed: the images are encoded by
 * sharp, the ZIPs are assembled to the specification with correct CRCs and a real central
 * directory, the PDF has a working cross-reference table, and the Compound File carries a
 * genuine header and directory sector. That matters because the code under test reads
 * bytes — a fixture that only satisfies the checks by construction would prove the tests
 * agree with themselves and nothing else.
 *
 * The invalid fixtures are equally real: they are what a renamed, truncated or empty file
 * actually looks like on disk.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';

let scratch: string | null = null;

/** A directory for fixture files, created once per test process. */
export async function fixtureDir(): Promise<string> {
  if (!scratch) {
    scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-tool-fixtures-'));
  }
  return scratch;
}

export async function cleanupFixtures(): Promise<void> {
  if (scratch) await fsp.rm(scratch, { recursive: true, force: true });
  scratch = null;
}

/** Writes `contents` to a uniquely named file and returns its path. */
export async function writeFixture(name: string, contents: Buffer | string): Promise<string> {
  const dir = await fixtureDir();
  const unique = `${crypto.randomBytes(4).toString('hex')}-${name}`;
  const filePath = path.join(dir, unique);
  await fsp.writeFile(filePath, contents);
  return filePath;
}

/* -------------------------------------------------------------------------- */
/* Images                                                                      */
/* -------------------------------------------------------------------------- */

type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif';

/** A genuinely encoded image of the given format. */
export function imageBuffer(format: ImageFormat, width = 48, height = 32): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 140, b: 210 } },
  });
  switch (format) {
    case 'jpeg':
      return base.jpeg().toBuffer();
    case 'png':
      return base.png().toBuffer();
    case 'webp':
      return base.webp().toBuffer();
    case 'gif':
      return base.gif().toBuffer();
  }
}

/**
 * An image of random pixels, and therefore one that does not compress.
 *
 * A flat colour encodes to a few kilobytes no matter how large the canvas, which is not
 * much of a test for anything that splits a file into pieces — GridFS stores in 255 KB
 * chunks, and a fixture that fits in one would exercise none of the reassembly.
 */
export async function incompressibleImage(width = 600, height = 600): Promise<Buffer> {
  const raw = crypto.randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * A JPEG whose header is intact and whose image data stops partway.
 *
 * The case a signature check cannot catch and a decode can: this is what a photo uploaded
 * over a connection that dropped looks like, and what used to become a permanently broken
 * tile in the gallery.
 */
export async function truncatedJpeg(): Promise<Buffer> {
  const whole = await imageBuffer('jpeg', 400, 400);
  return whole.subarray(0, Math.floor(whole.length / 3));
}

/** A PNG signature followed by bytes that are not a PNG. */
export async function corruptPng(): Promise<Buffer> {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, crypto.randomBytes(512)]);
}

/* -------------------------------------------------------------------------- */
/* ZIP / Office Open XML                                                       */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  contents: string;
}

/**
 * A real ZIP archive, stored (uncompressed), with a correct central directory.
 *
 * Written out by hand because nothing in the dependency tree writes ZIPs, and because the
 * validator's whole job for Office documents is to read this structure — handing it
 * something that merely resembles one would test nothing.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.contents, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags — no data descriptor, so sizes are in this header
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 10); // stored
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '</Types>';

/** An Office Open XML word processing package: the parts an OPC reader looks for. */
export function docxBuffer(): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', contents: CONTENT_TYPES_XML },
    { name: '_rels/.rels', contents: '<?xml version="1.0"?><Relationships/>' },
    { name: 'word/document.xml', contents: '<?xml version="1.0"?><w:document><w:body/></w:document>' },
  ]);
}

/** The spreadsheet equivalent, so a .docx cannot pass as an .xlsx or the reverse. */
export function xlsxBuffer(): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', contents: CONTENT_TYPES_XML },
    { name: '_rels/.rels', contents: '<?xml version="1.0"?><Relationships/>' },
    { name: 'xl/workbook.xml', contents: '<?xml version="1.0"?><workbook/>' },
  ]);
}

/** A perfectly valid ZIP that is not an Office package — the renamed-archive case. */
export function plainZipBuffer(): Buffer {
  return buildZip([
    { name: 'holiday-notes.txt', contents: 'nothing office about this' },
    { name: 'photos/readme.md', contents: '# not a document part' },
  ]);
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                         */
/* -------------------------------------------------------------------------- */

/** A minimal but structurally complete PDF: catalog, page tree, one page, xref, trailer. */
export function pdfBuffer(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'latin1');
}

/* -------------------------------------------------------------------------- */
/* Compound File Binary (legacy .doc / .xls)                                   */
/* -------------------------------------------------------------------------- */

/**
 * A Compound File with a valid header and a directory sector naming the stream that
 * identifies the application — `WordDocument` for .doc, `Workbook` for .xls.
 *
 * Built to the format rather than faked: the signature, the 512-byte sector shift and the
 * directory sector pointer are all what the validator reads, and the entry names are
 * UTF-16LE in a 128-byte directory entry exactly as a real document stores them.
 */
export function compoundFileBuffer(streamName: 'WordDocument' | 'Workbook'): Buffer {
  const SECTOR = 512;
  const file = Buffer.alloc(SECTOR * 3, 0);

  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  file.writeUInt16LE(0x003e, 24); // minor version
  file.writeUInt16LE(0x0003, 26); // major version — v3, 512-byte sectors
  file.writeUInt16LE(0xfffe, 28); // little-endian marker
  file.writeUInt16LE(9, 30); // sector shift: 1 << 9 == 512
  file.writeUInt16LE(6, 32); // mini sector shift
  file.writeUInt32LE(1, 44); // one FAT sector
  file.writeUInt32LE(1, 48); // directory starts at sector 1 (file offset 1024)
  file.writeUInt32LE(4096, 56); // mini stream cutoff
  file.writeUInt32LE(0xfffffffe, 60); // no mini FAT
  file.writeUInt32LE(0xfffffffe, 68); // no DIFAT
  file.writeUInt32LE(0, 76); // DIFAT[0] -> FAT at sector 0
  for (let i = 1; i < 109; i += 1) file.writeUInt32LE(0xffffffff, 76 + i * 4);

  const directoryStart = SECTOR * 2; // header + sector 0 (FAT)
  const writeEntry = (index: number, name: string, type: number) => {
    const at = directoryStart + index * 128;
    const encoded = Buffer.from(`${name}\0`, 'utf16le');
    encoded.copy(file, at);
    file.writeUInt16LE(encoded.length, at + 64); // name length in bytes, including the NUL
    file.writeUInt8(type, at + 66); // 5 = root storage, 2 = stream
    file.writeUInt32LE(0xffffffff, at + 68); // left sibling
    file.writeUInt32LE(0xffffffff, at + 72); // right sibling
    file.writeUInt32LE(0xffffffff, at + 76); // child
  };

  writeEntry(0, 'Root Entry', 5);
  writeEntry(1, streamName, 2);

  return file;
}
