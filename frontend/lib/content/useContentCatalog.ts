'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/lib/api/content';
import { resolveCatalog, type ResolvedCatalog } from './catalog';

export const CONTENT_CATALOG_KEY = ['content', 'catalog'] as const;

/**
 * The resolved content catalog for the app (see resolveCatalog). `settled` turns true once the
 * server has answered or failed — screens that must not briefly show something an administrator
 * has switched off (opening a game) wait for it; lists simply update.
 */
export function useContentCatalog(): ResolvedCatalog & { settled: boolean } {
  const query = useQuery({
    queryKey: CONTENT_CATALOG_KEY,
    queryFn: async () => (await contentApi.catalog()).data,
    staleTime: 60_000,
    retry: 1,
  });
  const resolved = useMemo(() => resolveCatalog(query.data), [query.data]);
  return { ...resolved, settled: !query.isLoading };
}
