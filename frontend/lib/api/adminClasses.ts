import { api } from './client';

/** Where a class stands: listed, hidden from the lists, switched off elsewhere, or archived. */
export type ClassStatus = 'visible' | 'hidden' | 'off' | 'archived';

export interface AdminClassSubject {
  key: string;
  title: string;
  description: string;
  glyph: string | null;
  /** Listed in this class. */
  isVisible: boolean;
  /** The subject is switched on (it can be switched off for every class elsewhere). */
  isAvailable: boolean;
  games: number;
}

/** A class with its subjects, as Manage Courses shows it (GET /api/admin/classes). */
export interface AdminClass {
  id: string;
  classLevel: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  details: string;
  image: string | null;
  isVisible: boolean;
  isEnabled: boolean;
  status: ClassStatus;
  /** 1-based place among the live classes; null when archived. */
  position: number | null;
  /** Classes 1–5, which the app has games and pictures for. */
  builtIn: boolean;
  subjects: AdminClassSubject[];
  counts: { subjects: number; visibleSubjects: number; games: number; courses: number };
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ClassSubjectInput {
  /** An existing subject; left out for a new one. */
  key?: string;
  title: string;
  description: string;
  glyph?: string | null;
  isVisible: boolean;
}

export interface ClassInput {
  title: string;
  subtitle: string;
  description: string;
  details: string;
  image: string | null;
  isVisible: boolean;
  position?: number;
  subjects: ClassSubjectInput[];
}

export const ADMIN_CLASSES_KEY = ['admin', 'classes'] as const;

export const adminClassesApi = {
  list: (status: 'live' | 'archived' | 'all' = 'live') => api.get<AdminClass[]>('/api/admin/classes', { status }),
  get: (level: number) => api.get<AdminClass>(`/api/admin/classes/${level}`),
  create: (input: ClassInput & { classLevel: number }) => api.post<AdminClass>('/api/admin/classes', input),
  update: (level: number, input: Partial<ClassInput>) => api.patch<AdminClass>(`/api/admin/classes/${level}`, input),
  setVisibility: (level: number, isVisible: boolean) => api.patch<AdminClass>(`/api/admin/classes/${level}/visibility`, { isVisible }),
  setPosition: (level: number, position: number) => api.patch<AdminClass>(`/api/admin/classes/${level}/order`, { position }),
  archive: (level: number) => api.delete<AdminClass>(`/api/admin/classes/${level}`),
  restore: (level: number) => api.post<AdminClass>(`/api/admin/classes/${level}/restore`),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.postForm<{ url: string; width: number; height: number }>('/api/admin/classes/images', form);
  },
};
