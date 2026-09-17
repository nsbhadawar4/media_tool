export type FileType = 'image' | 'video' | 'document';

export type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';

export type FolderSortOption = 'name_asc' | 'name_desc' | 'newest' | 'oldest';

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile?: string;
}

/** One row of the admin user list: the account plus how much it is storing. */
export interface AdminUserSummary extends UserProfile {
  mobile: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
  folderCount: number;
  mediaCount: number;
  storageUsedBytes: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalFolders: number;
  totalMedia: number;
  storageUsedBytes: number;
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
  /** Set when this folder was trashed only because an ancestor was — see the trash system. */
  deletedCascadeRoot?: string | null;
  /** Protected folders cannot be deleted through the UI or the API. */
  isProtected?: boolean;
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
  deletedCascadeRoot?: string | null;
  viewUrl: string;
  downloadUrl: string;
  /** Small derived preview. Null when none could be generated — fall back to viewUrl or a placeholder. */
  thumbnailUrl: string | null;
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
