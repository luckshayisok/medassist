import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Keep cached data for a week so the schedule works offline.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'online' },
  },
});

/**
 * Persist the query cache so today's medicines are available offline and at cold start.
 * Phase 12 moves this to encrypted SQLite with a sync outbox.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'medassist-query-cache',
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Wipe all cached health data (on sign-out / account deletion). */
export async function clearQueryCache() {
  queryClient.clear();
  await queryPersister.removeClient();
}
