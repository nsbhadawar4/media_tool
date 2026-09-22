import { PageHeader } from '@/components/ui/PageHeader';
import { MediaLibraryView } from '@/components/media/MediaLibraryView';

export default function MediaPage() {
  return (
    <div>
      <PageHeader title="Media" description="Every photo and video in your library, in one place." />
      {/* Its grid shows photos and videos, and so does its upload: a document offered
          here is refused before anything is sent, and again by the server. */}
      <MediaLibraryView
        uploadCategory="media"
        emptyMessage="Upload photos and videos to see them here."
      />
    </div>
  );
}
