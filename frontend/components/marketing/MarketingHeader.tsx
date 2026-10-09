'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { cn } from '@/utils/cn';
import type { MarketingLink } from './nav';

/**
 * The public site's header: sticky, glassy once the page has scrolled, with a full-width
 * menu below `lg`. `nav` holds only the sections that are switched on (MarketingShell).
 */
export function MarketingHeader({ nav }: { nav: readonly MarketingLink[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the menu, and the page behind it doesn't scroll while it is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // The section in view lights up its link. Only on the home page, where the sections are.
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (window.location.pathname !== '/') return;
    const ids = nav.map((item) => item.href.split('#')[1]).filter(Boolean);
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        // The first section (in page order) that is meaningfully on screen.
        const current = targets.find((t) => (visible.get(t.id) ?? 0) > 0);
        setActive(current ? current.id : null);
      },
      // A band across the upper middle of the screen, under the header.
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.01] },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [nav]);
  const isActive = (href: string) => active !== null && href.endsWith(`#${active}`);

  /**
   * The sliding indicator behind the current link. Moved by writing its style directly (no
   * state, so no extra render), from the link's own box — it follows resizes and font loading.
   */
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const navEl = navRef.current;
    const indicator = indicatorRef.current;
    if (!navEl || !indicator) return;
    const place = () => {
      const link = active ? navEl.querySelector<HTMLElement>(`a[href$="#${active}"]`) : null;
      if (!link) {
        indicator.style.opacity = '0';
        return;
      }
      indicator.style.opacity = '1';
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(navEl);
    return () => observer.disconnect();
  }, [active]);

  const close = () => setIsOpen(false);

  return (
    <header
      className={cn(
        'mk-safe-top sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        isScrolled || isOpen
          ? 'border-border bg-background/80 backdrop-blur-xl'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/#top" onClick={close} className="group flex shrink-0 items-center gap-2.5" aria-label="media_tool home">
          <Logo className="h-8 w-8 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">media_tool</span>
        </Link>

        <nav ref={navRef} aria-label="Main" className="mk-nav relative hidden items-center gap-0.5 rounded-full p-1 lg:flex">
          <span ref={indicatorRef} aria-hidden className="mk-nav-indicator pointer-events-none absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full opacity-0" />
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'location' : undefined}
              className={cn(
                'relative rounded-full px-3.5 py-1.5 text-[13px] font-medium text-foreground-soft transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                isActive(item.href) && 'text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={LOGIN_PATH}
            className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-foreground-soft transition-colors hover:text-foreground sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="btn-primary mk-sheen hidden items-center rounded-xl px-4 py-2 text-[13px] font-semibold text-accent-foreground sm:inline-flex"
          >
            Get Started
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="mk-mobile-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface/60 text-foreground transition hover:bg-surface-hover lg:hidden"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div id="mk-mobile-menu" className="animate-fade-in border-t border-border lg:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="rounded-xl px-3 py-3 text-[15px] font-medium text-foreground-soft transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Link
                href={LOGIN_PATH}
                onClick={close}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground"
              >
                Login
              </Link>
              <Link
                href="/signup"
                onClick={close}
                className="btn-primary inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-accent-foreground"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
