const MAX_FILENAME_LENGTH = 255;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const PATH_SEPARATORS = /[/\\]/;

/**
 * Validates a user-supplied filename before it's stored or displayed. This is a
 * distinct concern from MIME/extension checks: it guards against path traversal,
 * embedded control/NUL characters, and unreasonably long names — none of which
 * "looks like a valid .jpg" would catch.
 *
 * This REJECTS unsafe names rather than silently rewriting them (e.g. taking just the
 * basename of "../../etc/evil.png"): a name straight out of a browser's file picker
 * never contains a path separator, so one that does is either a deliberately crafted
 * request or a very unusual client — either way, surfacing it as a clear validation
 * error is more honest than quietly stripping it and continuing. Throws with a
 * user-facing message on failure; callers should treat that like any other rejected file.
 */
export function assertSafeFilename(rawName: string): string {
  const name = rawName.trim();

  if (!name || name === '.' || name === '..') {
    throw new Error('Filename is missing or invalid');
  }
  if (PATH_SEPARATORS.test(name)) {
    throw new Error('Filename must not contain path separators');
  }
  if (CONTROL_CHARS.test(name)) {
    throw new Error('Filename contains invalid control characters');
  }
  if (name.length > MAX_FILENAME_LENGTH) {
    throw new Error(`Filename is too long (max ${MAX_FILENAME_LENGTH} characters)`);
  }

  return name;
}
