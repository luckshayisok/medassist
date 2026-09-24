import AsyncStorage from '@react-native-async-storage/async-storage';
import { careApi, type CareAlert } from '@/services/api/care';
import { loadSession } from '@/services/auth/tokenStorage';
import { getNotifications } from '@/services/notifications/module';

const NOTIFIED_KEY = 'medassist-care-notified';
const KEEP = 300;

/** Plain, calm wording: a caregiver should check in, not panic. */
export function alertText(a: CareAlert) {
  const time = new Date(a.scheduledFor).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    title: `${a.patientName} may have missed a dose`,
    body: `${a.medication} at ${time} wasn't marked as taken. Maybe give them a call?`,
  };
}

/** Which alerts are new for this phone (not seen in the app, not notified before). Pure, for tests. */
export function newAlerts(alerts: CareAlert[], notified: string[]): CareAlert[] {
  const done = new Set(notified);
  return alerts.filter((a) => !a.seen && !done.has(a.id));
}

/** Show a phone notification for each new missed-dose alert. Safe to call often. */
export async function notifyCareAlerts(alerts: CareAlert[]): Promise<number> {
  const N = getNotifications();
  let notified: string[] = [];
  try {
    notified = JSON.parse((await AsyncStorage.getItem(NOTIFIED_KEY)) ?? '[]') as string[];
  } catch {
    notified = [];
  }
  const fresh = newAlerts(alerts, notified);
  if (!fresh.length) return 0;
  if (N) {
    for (const a of fresh.slice(0, 5)) {
      const { title, body } = alertText(a);
      await N.scheduleNotificationAsync({
        content: { title, body, data: { kind: 'care-alert', alertId: a.id, patientId: a.patientId } },
        trigger: null,
      }).catch(() => {});
    }
  }
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified, ...fresh.map((a) => a.id)].slice(-KEEP)));
  return fresh.length;
}

/** Background check for caregivers: fetch alerts (works even if the app has not been opened). */
export async function checkCareAlertsInBackground() {
  const session = await loadSession();
  if (session?.user.role !== 'CAREGIVER') return;
  await notifyCareAlerts(await careApi.alerts());
}

export async function clearCareNotified() {
  await AsyncStorage.removeItem(NOTIFIED_KEY);
}
