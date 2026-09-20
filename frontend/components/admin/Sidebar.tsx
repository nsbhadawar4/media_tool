'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderClosed, Users, LogOut, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';
import { ADMIN_NAV, USER_NAV, isNavItemActive } from './navItems';
import { cn } from '@/utils/cn';

interface SidebarProps {
  /** 'admin' swaps the navigation for the administration area. */
  variant?: 'user' | 'admin';
}

/**
 * The desktop navigation rail, shown from `lg` up. Narrower than that the app navigates
 * from the bottom tab bar instead — see MobileTabBar for why there is no drawer here.
 */
export function Sidebar({ variant = 'user' }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, isAdmin } = useAuth();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.replace('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

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
      <div className="flex shrink-0 items-center px-5 py-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sidebar-active">
            <Lock className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-sidebar-active">
            media_tool{isAdminArea && <span className="ml-1 text-xs font-normal opacity-70">admin</span>}
          </span>
        </div>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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

  return <aside className="hidden w-64 shrink-0 border-r border-border lg:block">{content}</aside>;
}
