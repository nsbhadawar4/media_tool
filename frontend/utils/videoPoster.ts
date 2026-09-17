/**
 * Captures a poster frame and duration for a video entirely in the browser.
 *
 * The API has no ffmpeg dependency, so this is where video thumbnails come from: the
 * browser decodes a frame it can already play, and the still is uploaded alongside the
 * file. That limits coverage to formats this browser can decode — MP4 and WebM always
 * work, MOV usually does, MKV generally does not — so every failure resolves to nulls
 * rather than throwing, and the gallery falls back to a typed placeholder.
 */

/** Matches the server's thumbnail size, so nothing larger than necessary is uploaded. */
const POSTER_MAX_EDGE = 480;
/** A frame this far in usually clears fade-ins and black leader frames. */
const POSTER_TARGET_SECONDS = 1;
/** Ceiling on decode + seek, so an unplayable file can never stall the upload queue. */
const POSTER_TIMEOUT_MS = 8000;

export interface VideoPosterResult {
  /** JPEG still of one frame, or null if the browser could not decode this video. */
  poster: Blob | null;
  /** Length in seconds, or null if unknown. */
  duration: number | null;
}

/** Scales `width`x`height` down to fit POSTER_MAX_EDGE, preserving aspect ratio. */
function fitWithin(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= POSTER_MAX_EDGE) return { width, height };
  const scale = POSTER_MAX_EDGE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function extractVideoPoster(file: File): Promise<VideoPosterResult> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');

    let settled = false;
    let duration: number | null = null;

    const finish = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve({ poster, duration });
    };

    // Resolves with whatever was learned so far — often the duration, even when no
    // frame could be drawn.
    const timer = setTimeout(() => finish(null), POSTER_TIMEOUT_MS);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    // Required before drawing to a canvas in some browsers, harmless for a blob URL.
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      // Never seek past the end of a very short clip.
      const target = duration ? Math.min(POSTER_TARGET_SECONDS, duration / 2) : POSTER_TARGET_SECONDS;
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    video.onseeked = () => {
      const { videoWidth, videoHeight } = video;
      if (!videoWidth || !videoHeight) {
        finish(null);
        return;
      }

      const { width, height } = fitWithin(videoWidth, videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        finish(null);
        return;
      }

      try {
        context.drawImage(video, 0, 0, width, height);
      } catch {
        // Tainted canvas or a decoder that produced no frame.
        finish(null);
        return;
      }

      canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82);
    };

    video.onerror = () => finish(null);

    video.src = objectUrl;
  });
}
