import { useCallback, useMemo, useState } from 'react';
import type { Media } from '@/types/api';

/**
 * Drives the fullscreen preview modals for a grid of media. Image next/prev navigation
 * cycles only through the images in the current list (matching how a photo viewer
 * behaves), while video/document previews are always single-item.
 */
export function useMediaViewer(media: Media[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const images = useMemo(() => media.filter((m) => m.fileType === 'image'), [media]);
  const activeMedia = useMemo(() => media.find((m) => m.id === activeId) ?? null, [media, activeId]);
  const activeImageIndex = activeMedia ? images.findIndex((m) => m.id === activeMedia.id) : -1;

  const openAt = useCallback((id: string) => setActiveId(id), []);
  const close = useCallback(() => setActiveId(null), []);

  const goNextImage = useCallback(() => {
    if (images.length === 0 || activeImageIndex === -1) return;
    const next = images[(activeImageIndex + 1) % images.length];
    if (next) setActiveId(next.id);
  }, [images, activeImageIndex]);

  const goPrevImage = useCallback(() => {
    if (images.length === 0 || activeImageIndex === -1) return;
    const prev = images[(activeImageIndex - 1 + images.length) % images.length];
    if (prev) setActiveId(prev.id);
  }, [images, activeImageIndex]);

  /**
   * Full-size URLs either side of the current image. The viewer renders these hidden so
   * the browser has them cached by the time the user arrows onto them.
   */
  const neighbourImageUrls = useMemo(() => {
    if (images.length < 2 || activeImageIndex === -1) return [];
    const next = images[(activeImageIndex + 1) % images.length];
    const prev = images[(activeImageIndex - 1 + images.length) % images.length];
    return [...new Set([next?.viewUrl, prev?.viewUrl])].filter((url): url is string => Boolean(url));
  }, [images, activeImageIndex]);

  return {
    activeMedia,
    openAt,
    close,
    goNextImage,
    goPrevImage,
    imageIndex: activeImageIndex,
    totalImages: images.length,
    neighbourImageUrls,
  };
}

export type MediaViewerState = ReturnType<typeof useMediaViewer>;
