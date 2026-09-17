import { useCallback, useMemo, useRef, useState } from 'react';
import type { Media } from '@/types/api';

/**
 * Tracks which items in the current grid are selected, so they can be acted on together.
 *
 * Scoped to the list it is given: the caller clears the selection whenever the query
 * behind that list changes (page, search, filter), because acting on items the user can
 * no longer see is never what they meant.
 */
export function useMediaSelection(items: Media[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  /** Anchor for shift-click range selection — the last item the user clicked directly. */
  const anchorId = useRef<string | null>(null);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  const toggle = useCallback(
    (id: string, extendRange = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const anchor = anchorId.current;

        if (extendRange && anchor && anchor !== id) {
          const from = orderedIds.indexOf(anchor);
          const to = orderedIds.indexOf(id);
          if (from !== -1 && to !== -1) {
            // A range always adds. Shift-click is how a selection grows; punching holes
            // in one by shift-clicking across it would be surprising.
            for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
              next.add(orderedIds[i]!);
            }
            return next;
          }
        }

        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });

      anchorId.current = id;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => setSelectedIds(new Set(orderedIds)), [orderedIds]);

  const clear = useCallback(() => {
    anchorId.current = null;
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  return {
    selectedIds,
    /** Selected items in grid order — the order a bulk download should follow. */
    selectedItems,
    selectedCount: selectedItems.length,
    isSelected: useCallback((id: string) => selectedIds.has(id), [selectedIds]),
    toggle,
    selectAll,
    clear,
    allSelected: orderedIds.length > 0 && selectedItems.length === orderedIds.length,
  };
}

export type MediaSelection = ReturnType<typeof useMediaSelection>;
