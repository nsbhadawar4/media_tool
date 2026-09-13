'use client';

import type { MediaViewerState } from '@/hooks/useMediaViewer';
import { ImageViewerModal } from './ImageViewerModal';
import { VideoPlayerModal } from './VideoPlayerModal';
import { DocumentViewerModal } from './DocumentViewerModal';

/** Renders whichever preview modal fits the currently active media item, or nothing. */
export function MediaViewerModals({ viewer }: { viewer: MediaViewerState }) {
  const { activeMedia, close, goNextImage, goPrevImage, imageIndex, totalImages } = viewer;

  if (!activeMedia) return null;

  if (activeMedia.fileType === 'image') {
    return (
      <ImageViewerModal
        key={activeMedia.id}
        media={activeMedia}
        index={imageIndex}
        total={totalImages}
        onClose={close}
        onNext={goNextImage}
        onPrev={goPrevImage}
      />
    );
  }

  if (activeMedia.fileType === 'video') {
    return <VideoPlayerModal media={activeMedia} onClose={close} />;
  }

  return <DocumentViewerModal media={activeMedia} onClose={close} />;
}
