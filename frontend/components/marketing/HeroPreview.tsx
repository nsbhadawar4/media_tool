'use client';

import { useState, type CSSProperties } from 'react';
import {
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderClosed,
  FolderOpen,
  GraduationCap,
  HardDrive,
  Image as ImageIcon,
  Play,
  Search,
  Star,
  Upload,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { PhotoArt } from './visuals';

/**
 * The hero's product preview: a miniature of the app in its own visual language. The three
 * views on the left really switch the window — Media, Documents, Folders — so the preview is
 * something to try, not just to look at. The file names and the upload are an illustration
 * (no counts, no claims); the controls are real buttons with a visible focus state.
 *
 * The first render is the Media view on server and client alike, so there is nothing to
 * mismatch on hydration.
 */

type View = 'media' | 'documents' | 'folders';

const VIEWS: ReadonlyArray<{ id: View; label: string; icon: typeof ImageIcon; title: string; subtitle: string }> = [
  { id: 'media', label: 'Media', icon: ImageIcon, title: 'Summer trip', subtitle: 'Photos and videos' },
  { id: 'documents', label: 'Documents', icon: FileText, title: 'Documents', subtitle: 'PDF, Word, Excel and text' },
  { id: 'folders', label: 'Folders', icon: FolderClosed, title: 'My library', subtitle: 'Folders inside folders' },
];

const DOCS = [
  { icon: FileText, color: '#f87171', name: 'Travel itinerary.pdf', kind: 'PDF', preview: true },
  { icon: FileSpreadsheet, color: '#34d399', name: 'Household budget.xlsx', kind: 'XLSX' },
  { icon: FileText, color: '#60a5fa', name: 'Cover letter.docx', kind: 'DOCX' },
  { icon: FileText, color: '#a1a1aa', name: 'Packing list.txt', kind: 'TXT', preview: true },
] as const;

const FOLDERS = [
  { name: 'Family', color: '#a78bfa', scene: 0 },
  { name: 'Summer trip', color: '#38bdf8', scene: 1 },
  { name: 'School', color: '#fbbf24', scene: 2 },
  { name: 'Receipts', color: '#34d399', scene: 5 },
] as const;

export function HeroPreview() {
  const [view, setView] = useState<View>('media');
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div role="group" aria-label="Product preview" className="relative mx-auto w-full max-w-[640px] lg:max-w-none">
      {/* Light behind the window, drifting slowly. */}
      <div aria-hidden className="mk-preview-light mk-drift pointer-events-none absolute -inset-10 -z-10" />

      <div className="mk-window relative overflow-hidden rounded-[22px]">
        {/* Title bar */}
        <div aria-hidden className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-3 text-[11px] text-subtle">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Search your library…</span>
          </div>
        </div>

        <div className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[148px_minmax(0,1fr)]">
          {/* Sidebar: the three views are real switches */}
          <div className="space-y-1 border-r border-white/[0.06] bg-black/20 p-2 sm:p-3">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                aria-label={`Show ${label}`}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors duration-200 sm:justify-start',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  view === id ? 'bg-accent/15 text-foreground ring-1 ring-accent/30' : 'text-subtle hover:bg-white/[0.04] hover:text-foreground-soft',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', view === id && 'text-accent-2')} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <div aria-hidden className="space-y-1 pt-1 opacity-70">
              {[GraduationCap, Star].map((Icon, i) => (
                <div key={i} className="flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-subtle sm:justify-start">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden h-1.5 w-14 rounded-full bg-white/[0.06] sm:block" />
                </div>
              ))}
            </div>
            <div aria-hidden className="mt-4 hidden rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 sm:block">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
                <HardDrive className="h-3 w-3" /> Storage
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full w-[38%] rounded-full bg-linear-to-r from-accent to-[#22d3ee]" />
              </div>
            </div>
          </div>

          {/* Content for the chosen view */}
          <div aria-hidden className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-foreground">{current.title}</p>
                <p className="truncate text-[10px] text-subtle">{current.subtitle}</p>
              </div>
              <span className="mk-sheen flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground shadow-[0_6px_16px_-6px_var(--accent)]">
                <Upload className="h-3 w-3" /> Upload
              </span>
            </div>

            {/* Fixed height for every view: switching never shifts the page. */}
            <div key={view} className="mk-view-enter h-[248px] sm:h-[268px]">
              {view === 'media' && (
                <div className="grid h-full grid-cols-4 grid-rows-3 gap-2">
                  <div className="mk-tile col-span-2 row-span-2 overflow-hidden rounded-xl">
                    <PhotoArt scene={0} />
                  </div>
                  <div className="mk-tile relative overflow-hidden rounded-xl">
                    <PhotoArt scene={1} />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
                        <Play className="ml-px h-3 w-3" fill="currentColor" />
                      </span>
                    </span>
                  </div>
                  <div className="mk-tile overflow-hidden rounded-xl">
                    <PhotoArt scene={2} />
                  </div>
                  <div className="mk-tile overflow-hidden rounded-xl">
                    <PhotoArt scene={4} />
                  </div>
                  <div className="mk-tile overflow-hidden rounded-xl">
                    <PhotoArt scene={5} />
                  </div>
                  <div className="mk-tile overflow-hidden rounded-xl">
                    <PhotoArt scene={3} />
                  </div>
                  <div className="mk-tile overflow-hidden rounded-xl">
                    <PhotoArt scene={1} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[#f87171]" />
                    <span className="truncate text-[11px] font-medium text-foreground-soft">Travel itinerary.pdf</span>
                  </div>
                </div>
              )}
              {view === 'documents' && (
                <div className="flex h-full flex-col gap-1.5">
                  {DOCS.map(({ icon: Icon, color, name, kind, ...rest }) => (
                    <div key={name} className="mk-row flex flex-1 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground-soft">{name}</span>
                      {'preview' in rest ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-2">
                          <Eye className="h-3 w-3" /> Preview
                        </span>
                      ) : (
                        <span className="shrink-0 rounded border border-white/[0.08] px-1 py-px text-[9px] font-semibold text-subtle">{kind}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {view === 'folders' && (
                <div className="grid h-full grid-cols-2 gap-2">
                  {FOLDERS.map((f) => (
                    <div key={f.name} className="mk-tile group/folder relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
                      <div className="h-1/2 overflow-hidden opacity-80">
                        <PhotoArt scene={f.scene} />
                      </div>
                      <div className="flex flex-1 items-center gap-2 px-2.5">
                        <FolderOpen className="h-4 w-4 shrink-0" style={{ color: f.color }} />
                        <span className="truncate text-[11px] font-semibold text-foreground">{f.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating: an upload in progress */}
      <div aria-hidden className="mk-float mk-chip absolute -bottom-7 -left-4 hidden w-56 rounded-2xl p-3 sm:block lg:-left-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent-2">
            <Upload className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground">Uploading 3 files</p>
            <p className="text-[10px] text-subtle">to Summer trip</p>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="mk-progress block h-full rounded-full bg-linear-to-r from-accent to-[#22d3ee]" />
        </div>
      </div>

      {/* Floating: a Kid Games result */}
      <div aria-hidden className="mk-float-slow mk-chip absolute -right-3 -top-10 hidden items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:flex lg:-right-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f59e0b]/15 text-[#fbbf24]">
          <GraduationCap className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-semibold text-foreground">Class 2 · Maths</p>
          <p className="flex items-center gap-0.5 text-[#fbbf24]">
            {[0, 1, 2].map((i) => (
              <Star key={i} className="h-3 w-3" fill="currentColor" style={{ '--i': i } as CSSProperties} />
            ))}
          </p>
        </div>
      </div>

      {/* Floating: saved */}
      <div aria-hidden className="mk-chip absolute -bottom-4 right-8 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium text-foreground-soft md:flex">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Saved to your private library
      </div>
    </div>
  );
}
