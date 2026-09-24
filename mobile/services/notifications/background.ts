import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DoseLog, Medication } from '@/types/medication';
import { syncReminders } from './reconcile';
import { notificationsSupported } from './setup';

/**
 * Tops up the rolling reminder window even if the app isn't opened for days.
 * The OS runs this roughly every few hours (not exactly); scheduled reminders themselves fire on time.
 */
export const REMINDER_REFRESH_TASK = 'medassist-refresh-reminders';

type BackgroundTaskModule = typeof import('expo-background-task');
type TaskManagerModule = typeof import('expo-task-manager');

/** Loaded lazily, and only where reminders work (not web / Expo Go on Android). */
function modules(): { BackgroundTask: BackgroundTaskModule; TaskManager: TaskManagerModule } | null {
  if (!notificationsSupported()) return null;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return {
      BackgroundTask: require('expo-background-task') as BackgroundTaskModule,
      TaskManager: require('expo-task-manager') as TaskManagerModule,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    return null;
  }
}

/** Read what the app last saved to disk — the background task has no React state. */
export async function readCachedState(): Promise<{ medications: Medication[]; logs: Record<string, DoseLog> }> {
  const [cacheJson, logsJson] = await Promise.all([
    AsyncStorage.getItem('medassist-query-cache'),
    AsyncStorage.getItem('medassist-dose-logs'),
  ]);
  let medications: Medication[] = [];
  try {
    const cache = cacheJson ? JSON.parse(cacheJson) : null;
    const q = cache?.clientState?.queries?.find((x: { queryKey: unknown[] }) => x.queryKey?.[0] === 'medications');
    medications = (q?.state?.data as Medication[]) ?? [];
  } catch {
    medications = [];
  }
  let logs: Record<string, DoseLog> = {};
  try {
    logs = (logsJson ? JSON.parse(logsJson)?.state?.logs : null) ?? {};
  } catch {
    logs = {};
  }
  return { medications, logs };
}

// Must be defined at module scope (app start) so the OS can run it without the UI.
const m = modules();
if (m) {
  m.TaskManager.defineTask(REMINDER_REFRESH_TASK, async () => {
    try {
      const { medications, logs } = await readCachedState();
      await syncReminders(medications, logs);
      return m.BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return m.BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerReminderRefresh() {
  if (!m) return;
  if (await m.TaskManager.isTaskRegisteredAsync(REMINDER_REFRESH_TASK)) return;
  await m.BackgroundTask.registerTaskAsync(REMINDER_REFRESH_TASK, { minimumInterval: 6 * 60 });
}

export async function unregisterReminderRefresh() {
  if (!m) return;
  if (await m.TaskManager.isTaskRegisteredAsync(REMINDER_REFRESH_TASK)) {
    await m.BackgroundTask.unregisterTaskAsync(REMINDER_REFRESH_TASK);
  }
}
