import { PageHeader } from '@/components/ui/PageHeader';
import { MediaLibraryView } from '@/components/media/MediaLibraryView';

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader title="Documents" description="PDFs, Word, Excel and text files across your library." />
      <MediaLibraryView fixedFileType="document" emptyMessage="Upload PDFs, Word, Excel or text files to see them here." />
    </div>
  );
}
