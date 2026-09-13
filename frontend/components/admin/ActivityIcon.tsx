import {
  LogIn,
  LogOut,
  FolderPlus,
  FolderEdit,
  FolderMinus,
  FolderUp,
  Upload,
  PencilLine,
  Trash2,
  RotateCcw,
  FolderInput,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  login: LogIn,
  login_failed: ShieldAlert,
  logout: LogOut,
  folder_created: FolderPlus,
  folder_renamed: FolderEdit,
  folder_updated: FolderEdit,
  folder_deleted: FolderMinus,
  folder_restored: FolderUp,
  folder_permanently_deleted: Trash2,
  media_uploaded: Upload,
  media_renamed: PencilLine,
  media_updated: PencilLine,
  media_deleted: Trash2,
  media_restored: RotateCcw,
  media_permanently_deleted: Trash2,
  media_moved: FolderInput,
};

export function ActivityIcon({ action, className }: { action: string; className?: string }) {
  const Icon = ICONS[action] ?? LogIn;
  return <Icon className={className} />;
}
