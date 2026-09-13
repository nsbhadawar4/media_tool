import { PageHeader } from '@/components/ui/PageHeader';
import { MediaLibraryView } from '@/components/media/MediaLibraryView';

export default function MediaPage() {
  return (
    <div>
      <PageHeader title="Media" description="Every photo and video in your library, in one place." />
      <MediaLibraryView emptyMessage="Upload photos and videos to see them here." />
    </div>
  );
}
