import { api, NetworkError } from '@/services/api/client';
import { useDoseLogs, type ServerLog, type SyncResult } from '@/store/doseLogStore';

const BATCH = 100;
let flushing: Promise<boolean> | null = null;

/**
 * Send the offline outbox. Single-flight and safe to call as often as you like: the server
 * de-duplicates by clientId, so a retry after a dropped connection never double-counts a dose.
 * Resolves true if anything was sent.
 */
export function flushDoseOutbox(): Promise<boolean> {
  if (flushing) return flushing;
  // NB: assign *then* clear in .finally — an async fn with nothing to await finishes synchronously,
  // so clearing inside it would run before the assignment and leave a stale promise here forever.
  const run = (async () => {
    let sent = false;
    try {
      for (;;) {
        const batch = useDoseLogs.getState().outbox.slice(0, BATCH);
        if (!batch.length) return sent;
        const { results } = await api<{ results: SyncResult[] }>('/dose-logs/sync', { method: 'POST', body: { logs: batch } });
        useDoseLogs.getState().acknowledge(results);
        sent = true;
      }
    } catch (e) {
      if (e instanceof NetworkError) return sent; // try again when back online
      throw e;
    }
  })();
  flushing = run;
  void run
    .finally(() => {
      if (flushing === run) flushing = null;
    })
    .catch(() => {});
  return run;
}

/** Pull recent history from the server (other devices, reinstall) and merge it in. */
export async function pullDoseLogs(days = 30): Promise<void> {
  const to = new Date(Date.now() + 86_400_000);
  const from = new Date(Date.now() - days * 86_400_000);
  try {
    const logs = await api<ServerLog[]>(`/dose-logs?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    useDoseLogs.getState().mergeServerLogs(logs, { from, to });
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
  }
}
