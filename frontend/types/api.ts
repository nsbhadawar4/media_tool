export type FileType = 'image' | 'video' | 'document';

export type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
}

export interface Folder {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentFolder: string | null;
  path: string[];
  coverImage?: Media | string | null;
  itemCount: number;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Media {
  id: string;
  folderId: string | null;
  originalName: string;
  mimeType: string;
  fileType: FileType;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewUrl: string;
  downloadUrl: string;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface ActivityLog {
  _id: string;
  action: string;
  targetType: 'folder' | 'media' | 'auth';
  targetId: string | null;
  targetName: string | null;
  message: string;
  performedByEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalFolders: number;
  totalImages: number;
  totalVideos: number;
  totalDocuments: number;
  storageUsedBytes: number;
  trashItems: number;
}

export interface DashboardRecent {
  recentUploads: Media[];
  recentActivity: ActivityLog[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  error: { message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
