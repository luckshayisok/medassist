import type { NotificationContentInput } from 'expo-notifications';
import type { DoseLog, Medication } from '@/types/medication';
import { planReminders, reminderSignature, type PlannedReminder } from '@/utils/reminderPlan';
import { getNotifications } from './module';
import { getReminderPermission } from './permissions';
import { CATEGORY_DOSE, CHANNEL_ID, configureNotifications, OWNER } from './setup';

export interface SyncResult {
  status: 'ok' | 'no-permission' | 'unsupported';
  planned: number;
  added: number;
  cancelled: number;
}

type ReminderData = { owner: string; sig: string; doseKey: string; kind: string };
type N = NonNullable<ReturnType<typeof getNotifications>>;

const isOurs = (data: unknown) => (data as Partial<ReminderData> | null)?.owner === OWNER;

function content(N: N, r: PlannedReminder): NotificationContentInput {
  return {
    title: r.title,
    body: r.body,
    sound: 'default',
    categoryIdentifier: CATEGORY_DOSE,
    // iOS: break through Focus summaries (needs the Time Sensitive capability in the build).
    interruptionLevel: 'timeSensitive',
    priority: N.AndroidNotificationPriority.MAX,
    data: { owner: OWNER, sig: reminderSignature(r), doseKey: r.doseKey, kind: r.kind } satisfies ReminderData,
  };
}

// Serialise syncs: overlapping runs (app resume + data change) would double-schedule.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Make the OS schedule match the plan: cancel stale reminders (deleted medicine, changed time,
 * dose already taken) and add missing ones. Idempotent — safe to call on every change.
 */
export function syncReminders(medications: Medication[], logs: Record<string, DoseLog>, now = new Date()): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    const N = getNotifications();
    if (!N) return { status: 'unsupported', planned: 0, added: 0, cancelled: 0 };
    await configureNotifications();
    if ((await getReminderPermission()) !== 'granted') return { status: 'no-permission', planned: 0, added: 0, cancelled: 0 };

    const desired = new Map(planReminders(medications, logs, now).map((r) => [r.id, r]));
    const existing = (await N.getAllScheduledNotificationsAsync()).filter((n) => isOurs(n.content.data));

    const keep = new Set<string>();
    let cancelled = 0;
    for (const n of existing) {
      const want = desired.get(n.identifier);
      if (want && (n.content.data as ReminderData).sig === reminderSignature(want)) {
        keep.add(n.identifier);
      } else {
        await N.cancelScheduledNotificationAsync(n.identifier);
        cancelled++;
      }
    }

    let added = 0;
    for (const r of desired.values()) {
      if (keep.has(r.id)) continue;
      await N.scheduleNotificationAsync({
        identifier: r.id,
        content: content(N, r),
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL_ID },
      });
      added++;
    }
    return { status: 'ok', planned: desired.size, added, cancelled };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

/** On sign-out: remove every reminder we scheduled (and any showing in the tray). */
export async function cancelAllReminders() {
  const N = getNotifications();
  if (!N) return;
  const mine = (await N.getAllScheduledNotificationsAsync()).filter((n) => isOurs(n.content.data));
  await Promise.all(mine.map((n) => N.cancelScheduledNotificationAsync(n.identifier)));
  await N.dismissAllNotificationsAsync();
}

export async function countScheduledReminders(): Promise<number> {
  const N = getNotifications();
  if (!N) return 0;
  const all = await N.getAllScheduledNotificationsAsync();
  return all.filter((n) => isOurs(n.content.data) && (n.content.data as ReminderData).kind !== 'test').length;
}

/** Lets the patient/caregiver check that reminders really pop up on this phone. */
export async function sendTestReminder(seconds = 10) {
  const N = getNotifications();
  if (!N) return;
  await configureNotifications();
  await N.scheduleNotificationAsync({
    identifier: `test:${Date.now()}`,
    content: {
      title: '💊 Test reminder',
      body: 'This is how your medicine reminders will look. You can close this.',
      sound: 'default',
      priority: N.AndroidNotificationPriority.MAX,
      data: { owner: OWNER, kind: 'test', sig: '', doseKey: '' } satisfies ReminderData,
    },
    trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
}
