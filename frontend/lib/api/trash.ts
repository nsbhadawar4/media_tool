import { api } from './client';
import type { Folder, Media } from '@/types/api';

export interface TrashResult {
  folders: Folder[];
  media: Media[];
}

export const trashApi = {
  list: () => api.get<TrashResult>('/api/trash'),
  restore: (id: string) => api.post<{ type: 'folder' | 'media' }>(`/api/trash/${id}/restore`),
  permanentlyDelete: (id: string) => api.delete<{ type: 'folder' | 'media' }>(`/api/trash/${id}/permanent`),
};
