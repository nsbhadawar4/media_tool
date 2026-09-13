import { api } from './client';
import type { FileType, Folder, Media, SortOption } from '@/types/api';

export interface SearchResult {
  folders: Folder[];
  media: Media[];
}

export const searchApi = {
  run: (params: { q: string; fileType?: FileType; sort?: SortOption; page?: number; limit?: number }) =>
    api.get<SearchResult>('/api/search', { ...params }),
};
