'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

/**
 * Hook to trigger cloud sync on login.
 * Call this once in a component that has access to auth state.
 */
export function useSync(userId: string | null | undefined) {
  const fetchAndMergeCloudProjects = useAppStore((s) => s.fetchAndMergeCloudProjects);
  const syncAllProjects = useAppStore((s) => s.syncAllProjects);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!userId || hasSynced.current) return;
    hasSynced.current = true;

    // 1. Fetch cloud-only projects into local state
    // 2. Upload local-only projects to cloud
    (async () => {
      try {
        await fetchAndMergeCloudProjects();
        await syncAllProjects();
      } catch (err) {
        console.warn('[useSync] initial sync failed:', err);
      }
    })();
  }, [userId, fetchAndMergeCloudProjects, syncAllProjects]);
}
