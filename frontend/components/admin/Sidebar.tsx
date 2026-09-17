'use client';

import { useEffect, useRef } from 'react';
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
  Users,
  BarChart3,
  LogOut,
  Lock,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';
import { cn } from '@/utils/cn';

const USER_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/folders', label: 'Folders', icon: FolderClosed },
  { href: '/media', label: 'Media', icon: ImageIcon },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/trash', label: 'Trash', icon: Trash2 },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

const ADMIN_NAV = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/stats', label: 'Statistics', icon: BarChart3 },
] as const;

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  /** 'admin' swaps the navigation for the administration area. */
  variant?: 'user' | 'admin';
}

export function Sidebar({ isMobileOpen, onCloseMobile, variant = 'user' }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, isAdmin } = useAuth();
  const toast = useToast();
  const drawerRef = useRef<HTMLDivElement>(null);

  // The drawer covers the page, so it behaves like a dialog: Escape closes it, the page
  // behind it stops scrolling, and focus moves into it for keyboard and screen-reader users.
  useEffect(() => {
    if (!isMobileOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isMobileOpen, onCloseMobile]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const isAdminArea = variant === 'admin';
  const navItems = isAdminArea ? ADMIN_NAV : USER_NAV;
  // Only an administrator is offered the cross-link, and only from the other side.
  const crossLink = isAdminArea
    ? { href: '/dashboard', label: 'My library', icon: FolderClosed }
    : isAdmin
      ? { href: '/admin/users', label: 'Administration', icon: Users }
      : null;

  const content = (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-foreground">
      <div className="flex shrink-0 items-center justify-between px-5 py-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sidebar-active">
            <Lock className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-sidebar-active">
            media_tool{isAdminArea && <span className="ml-1 text-xs font-normal opacity-70">admin</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-sidebar-foreground transition hover:bg-sidebar-hover hover:text-sidebar-active lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const isActive = isItemActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-white/10 text-sidebar-active'
                  : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-active',
              )}
            >
              {/* Marks the active item without relying on colour alone. */}
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity duration-150',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-safe-bottom shrink-0 px-3 pb-5 pt-2">
        {crossLink && (
          <Link
            href={crossLink.href}
            onClick={onCloseMobile}
            className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-active"
          >
            <crossLink.icon className="h-4 w-4 shrink-0" />
            {crossLink.label}
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-active"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">{content}</aside>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCloseMobile} aria-hidden />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            // Slides in from the edge it is anchored to; the shared slide-up keyframe
            // moved it vertically, which read as the wrong panel appearing.
            className="animate-slide-in-left absolute inset-y-0 left-0 w-68 max-w-[85vw] shadow-2xl"
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
}
