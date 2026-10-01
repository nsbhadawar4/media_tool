'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderClosed, HardDrive, Users, LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/dashboard';
import { formatBytes } from '@/utils/format';
import { Logo } from '@/components/brand/Logo';
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
  // Same key the dashboard uses, so this is a cache hit rather than a second request.
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
    enabled: variant === 'user',
  });
  const storageUsed = statsQuery.data?.data.storageUsedBytes ?? null;

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

  // Groups the flat nav list into labelled sections. Admin has only two items, so it gets
  // one unlabelled group; the user nav splits where the pages change character.
  const groups: Array<{ label?: string; items: typeof navItems }> = isAdminArea
    ? [{ items: navItems }]
    : [
        { label: 'Library', items: navItems.slice(0, 4) },
        { label: 'Manage', items: navItems.slice(4, 6) },
        { label: 'Account', items: navItems.slice(6) },
      ];

  const linkClass =
    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150';

  const content = (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The mark carries its own tile and colour, so it needs no container to sit in. */}
          <Logo className="h-8 w-8 shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-active">
            media_tool{isAdminArea && <span className="ml-1 text-xs font-normal opacity-70">admin</span>}
          </span>
        </div>
      </div>

      <nav aria-label="Main" className="app-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {groups.map((group, index) => (
          <div key={group.label ?? index}>
            {group.label && (
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      linkClass,
                      isActive
                        ? 'bg-accent/12 text-sidebar-active'
                        : 'hover:bg-sidebar-hover hover:text-sidebar-active',
                    )}
                  >
                    {/* Marks the active item without relying on colour alone. */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity duration-150',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        isActive ? 'text-accent' : 'text-sidebar-foreground/80 group-hover:text-sidebar-active',
                      )}
                      strokeWidth={1.85}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="app-safe-bottom shrink-0 border-t border-border px-3 pb-4 pt-3">
        {!isAdminArea && storageUsed !== null && (
          <div className="mb-3 rounded-lg border border-border bg-surface px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/70">
              <HardDrive className="h-3.5 w-3.5" />
              Storage
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums text-sidebar-active">{formatBytes(storageUsed)}</p>
            <p className="text-[11px] text-sidebar-foreground/70">used across your library</p>
          </div>
        )}
        {crossLink && (
          <Link href={crossLink.href} className={cn(linkClass, 'hover:bg-sidebar-hover hover:text-sidebar-active')}>
            <crossLink.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
            {crossLink.label}
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(linkClass, 'w-full hover:bg-sidebar-hover hover:text-sidebar-active')}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
          Sign out
        </button>
      </div>
    </div>
  );

  return <aside className="hidden w-60 shrink-0 border-r border-border lg:block xl:w-64">{content}</aside>;
}
