'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronsLeft, FolderClosed, HardDrive, LogOut, Users } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLogoutPrompt } from '@/components/auth/LogoutPrompt';
import { dashboardApi } from '@/lib/api/dashboard';
import { formatBytes } from '@/utils/format';
import { ADMIN_NAV, USER_NAV, isNavItemActive } from './navItems';
import { badgeText, useNavBadges } from './navBadges';
import { cn } from '@/utils/cn';

interface SidebarContentProps {
  variant?: 'user' | 'admin';
  /** Icon-only rail. Labels fade and collapse; each link gains a tooltip. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Called after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}

/**
 * The navigation itself, shared by the desktop rail and the mobile drawer so the two can
 * never drift apart.
 */
export function SidebarContent({
  variant = 'user',
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();
  const { isAdmin, user } = useAuth();
  // Same key the dashboard uses, so this is a cache hit rather than a second request.
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
    enabled: variant === 'user',
  });
  const storageUsed = statsQuery.data?.data.storageUsedBytes ?? null;

  const { requestLogout } = useLogoutPrompt();
  const handleLogout = () => {
    onNavigate?.();
    requestLogout();
  };

  const isAdminArea = variant === 'admin';
  const navItems = isAdminArea ? ADMIN_NAV : USER_NAV;
  const badges = useNavBadges();
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
        // Library runs through Games and Kid Games; slicing by href keeps that true if items move.
        { label: 'Library', items: navItems.slice(0, navItems.findIndex((item) => item.href === '/trash')) },
        { label: 'Manage', items: navItems.slice(navItems.findIndex((item) => item.href === '/trash'), navItems.findIndex((item) => item.href === '/profile')) },
        { label: 'Account', items: navItems.slice(navItems.findIndex((item) => item.href === '/profile')) },
      ];

  const labelClass = cn(
    'truncate transition-[opacity,max-width] duration-200',
    collapsed ? 'max-w-0 opacity-0' : 'max-w-40 opacity-100',
  );

  const linkClass = cn(
    'nav-link group relative flex items-center rounded-xl py-2.5 text-[13px] font-medium transition-colors duration-150',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
  );

  return (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-foreground">
      {/* Brand */}
      <div className={cn('flex h-[68px] shrink-0 items-center', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
        <Link
          href={isAdminArea ? '/admin/users' : '/dashboard'}
          onClick={onNavigate}
          aria-label="media_tool home"
          className="group flex min-w-0 items-center gap-3"
        >
          <span className="relative shrink-0">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl bg-accent/50 opacity-60 blur-lg transition-opacity duration-300 group-hover:opacity-100"
            />
            <Logo className="relative h-9 w-9 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3" />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-semibold tracking-tight text-sidebar-active">
                media_tool
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/70">
                {isAdminArea ? 'Administration' : 'Private library'}
              </span>
            </span>
          )}
        </Link>
        {onToggleCollapsed && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            data-tooltip="Collapse"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-hover hover:text-sidebar-active lg:flex"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {onToggleCollapsed && collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          data-tooltip="Expand"
          data-tooltip-side="right"
          className="mx-auto mb-1 hidden h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-hover hover:text-sidebar-active lg:flex"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" />
        </button>
      )}

      {/* Navigation */}
      <nav aria-label="Main" className={cn('app-scroll min-h-0 flex-1 space-y-5 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex}>
            {group.label &&
              (collapsed ? (
                <div aria-hidden className="mx-3 mb-2 h-px bg-border" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/55">
                  {group.label}
                </p>
              ))}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    data-tooltip={collapsed ? item.label : undefined}
                    data-tooltip-side="right"
                    className={cn(
                      linkClass,
                      isActive
                        ? 'text-sidebar-active'
                        : 'hover:bg-sidebar-hover hover:text-sidebar-active',
                    )}
                  >
                    {/* Marks the active item without relying on colour alone. */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-accent nav-indicator transition-all duration-300',
                        collapsed ? '-left-2' : '-left-3',
                        isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                      )}
                    />
                    <Icon
                      className={cn(
                        'nav-icon h-[18px] w-[18px] shrink-0',
                        isActive ? 'text-accent-2' : 'text-sidebar-foreground/80 group-hover:text-sidebar-active',
                      )}
                      strokeWidth={1.85}
                    />
                    <span className={labelClass}>{item.label}</span>
                    {badges[item.href] ? (
                      <span
                        aria-label={`${badges[item.href]} waiting`}
                        className={cn(
                          'rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-accent-foreground',
                          collapsed ? 'absolute right-1 top-1' : 'ml-auto',
                        )}
                      >
                        {badgeText(badges[item.href])}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: storage, account, sign out */}
      <div className={cn('app-safe-bottom shrink-0 space-y-2 border-t border-border pb-4 pt-3', collapsed ? 'px-2' : 'px-3')}>
        {!isAdminArea && storageUsed !== null && !collapsed && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className="gradient-border group block rounded-xl bg-surface/80 px-3.5 py-3 transition-colors hover:bg-surface-elevated"
          >
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/70">
              <HardDrive className="h-3.5 w-3.5 text-accent-2" />
              Storage
            </div>
            <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none text-sidebar-active">
              {formatBytes(storageUsed)}
            </p>
            <p className="mt-1 text-[11px] text-sidebar-foreground/70">used across your library</p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full w-1/3 rounded-full bg-linear-to-r from-accent to-accent-2 transition-[width] duration-700 group-hover:w-1/2" />
            </div>
          </Link>
        )}

        {crossLink && (
          <Link
            href={crossLink.href}
            onClick={onNavigate}
            aria-label={collapsed ? crossLink.label : undefined}
            data-tooltip={collapsed ? crossLink.label : undefined}
            data-tooltip-side="right"
            className={cn(linkClass, 'hover:bg-sidebar-hover hover:text-sidebar-active')}
          >
            <crossLink.icon className="nav-icon h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
            <span className={labelClass}>{crossLink.label}</span>
          </Link>
        )}

        <div
          className={cn(
            'flex items-center rounded-xl',
            collapsed ? 'flex-col gap-2' : 'gap-2.5 border border-border bg-surface/60 p-2',
          )}
        >
          {user && <Avatar name={user.name} src={user.avatarUrl} size="sm" />}
          {!collapsed && user && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-sidebar-active">{user.name}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/70">{user.email}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            data-tooltip="Sign out"
            data-tooltip-side="right"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.85} />
          </button>
        </div>
      </div>
    </div>
  );
}

type SidebarProps = Omit<SidebarContentProps, 'onNavigate'>;

/**
 * The desktop navigation rail, shown from `lg` up. Narrower than that the same content is
 * opened as a drawer from the header's menu button (see MobileDrawer).
 */
export function Sidebar(props: SidebarProps) {
  return (
    <aside
      className={cn(
        'sidebar-width hidden shrink-0 overflow-visible border-r border-border lg:block',
        props.collapsed ? 'w-[76px]' : 'w-60 xl:w-64',
      )}
    >
      <SidebarContent {...props} />
    </aside>
  );
}
