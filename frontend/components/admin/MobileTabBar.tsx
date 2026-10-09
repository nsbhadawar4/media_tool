'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Ellipsis, LogOut, Users, FolderClosed } from 'lucide-react';
import { BottomSheet, SheetItem } from '@/components/ui/BottomSheet';
import { useAuth } from '@/lib/auth/AuthContext';
import { useLogoutPrompt } from '@/components/auth/LogoutPrompt';
import { ADMIN_HOME_PATH, ADMIN_LIBRARY_PATH } from '@/lib/auth/routes';
import { ADMIN_NAV_GROUPS, TAB_SLOTS, USER_NAV_GROUPS, isNavItemActive, liveNavItems, openNavGroups, type NavItem } from './navItems';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { badgeText, useNavBadges } from './navBadges';
import { cn } from '@/utils/cn';

/**
 * The phone's primary navigation: a bar pinned to the bottom edge, where a thumb rests.
 *
 * This replaces the hamburger drawer below `lg` rather than sitting alongside it. Two
 * navigation systems on one screen is how a web page behaves; an app has one, and it is
 * always visible. From `lg` up this renders nothing and the sidebar is unchanged.
 */
export function MobileTabBar({ variant = 'user' }: { variant?: 'user' | 'admin' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isAdminArea = variant === 'admin';
  const catalog = useContentCatalog();
  const nav = liveNavItems(isAdminArea ? ADMIN_NAV_GROUPS : openNavGroups(USER_NAV_GROUPS, catalog.isSectionOn));
  const tabs = nav.slice(0, TAB_SLOTS);
  const overflow = nav.slice(TAB_SLOTS);

  // Only an administrator is offered the cross-link, and only from the other side.
  const crossLink: NavItem | null = isAdminArea
    ? { href: ADMIN_LIBRARY_PATH, label: 'My library', icon: FolderClosed }
    : isAdmin
      ? { href: ADMIN_HOME_PATH, label: 'Administration', icon: Users }
      : null;

  // "More" reads as selected whenever the open page lives behind it, so the bar never shows
  // nothing selected.
  const isMoreActive = overflow.some((item) => isNavItemActive(pathname, item.href, item.exact));

  const { requestLogout } = useLogoutPrompt();
  const handleSignOut = () => {
    setIsMoreOpen(false);
    requestLogout();
  };

  const go = (href: string) => {
    setIsMoreOpen(false);
    router.push(href);
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="surface-glass app-no-select fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden"
      >
        <div className="flex h-16 items-stretch">
          {tabs.map((item) => (
            <TabLink key={item.href} item={item} isActive={isNavItemActive(pathname, item.href, item.exact)} />
          ))}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            className="flex flex-1 flex-col items-center justify-center gap-1 pt-1 transition active:scale-95"
          >
            <TabIconSlot isActive={isMoreActive || isMoreOpen}>
              <Ellipsis className="h-5 w-5" />
            </TabIconSlot>
            <TabLabel isActive={isMoreActive || isMoreOpen}>More</TabLabel>
          </button>
        </div>

        {/* Paints the bar's own background down through the home-indicator strip, so the
            page does not show through underneath it. */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>

      <BottomSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} title="More">
        <div role="menu" aria-orientation="vertical" className="pt-1">
          {overflow.map((item) => (
            <SheetItem
              key={item.href}
              icon={<item.icon className="h-5 w-5" />}
              label={item.label}
              isActive={isNavItemActive(pathname, item.href, item.exact)}
              onClick={() => go(item.href)}
            />
          ))}

          {crossLink && (
            <SheetItem
              icon={<crossLink.icon className="h-5 w-5" />}
              label={crossLink.label}
              onClick={() => go(crossLink.href)}
            />
          )}

          <div className="my-1 border-t border-border" />

          <SheetItem icon={<LogOut className="h-5 w-5" />} label="Sign out" onClick={handleSignOut} danger />
        </div>
      </BottomSheet>
    </>
  );
}

function TabLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  const badge = useNavBadges()[item.href];
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={badge ? `${item.label}, ${badge} waiting` : undefined}
      className="flex flex-1 flex-col items-center justify-center gap-1 pt-1 transition active:scale-95"
    >
      <TabIconSlot isActive={isActive}>
        <span className="relative">
          <Icon className="h-5 w-5" />
          {badge ? (
            <span aria-hidden className="absolute -right-2.5 -top-1.5 rounded-full bg-accent px-1 text-[9px] font-bold leading-[14px] tabular-nums text-accent-foreground">
              {badgeText(badge)}
            </span>
          ) : null}
        </span>
      </TabIconSlot>
      <TabLabel isActive={isActive}>{item.label}</TabLabel>
    </Link>
  );
}

/**
 * The pill behind the active tab's icon. Selection is carried by the pill's shape as well
 * as its colour, and the label underneath states it outright — so the active tab is not
 * signalled by hue alone. The stroke weight stays constant across states, since every other
 * icon in the app is drawn at Lucide's default.
 */
function TabIconSlot({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200',
        isActive ? 'bg-accent/15 text-accent' : 'text-muted',
      )}
    >
      {children}
    </span>
  );
}

function TabLabel({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'max-w-full truncate px-1 text-[10px] font-medium leading-none',
        isActive ? 'text-accent' : 'text-muted',
      )}
    >
      {children}
    </span>
  );
}
