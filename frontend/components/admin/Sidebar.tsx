'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderClosed,
  Image as ImageIcon,
  FileText,
  Trash2,
  Activity,
  Settings,
  LogOut,
  Lock,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/folders', label: 'Folders', icon: FolderClosed },
  { href: '/admin/media', label: 'Media', icon: ImageIcon },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  { href: '/admin/trash', label: 'Trash', icon: Trash2 },
  { href: '/admin/activity', label: 'Activity Logs', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
] as const;

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.replace('/admin/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const content = (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-foreground">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-sidebar-active">
            <Lock className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-sidebar-active">media_tool</span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-sidebar-foreground hover:bg-sidebar-hover lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-white/10 text-sidebar-active'
                  : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-active',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5 pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition hover:bg-sidebar-hover hover:text-sidebar-active"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 lg:block">{content}</aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <div className="animate-slide-up absolute inset-y-0 left-0 w-64 shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
}
