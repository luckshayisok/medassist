import { Linking } from 'react-native';
import { getNotifications } from './module';
import { configureNotifications } from './setup';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getReminderPermission(): Promise<ReminderPermission> {
  const N = getNotifications();
  if (!N) return 'unsupported';
  const p = await N.getPermissionsAsync();
  if (p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Ask once; if the user said no before, the OS won't ask again — send them to Settings instead. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  const N = getNotifications();
  if (!N) return 'unsupported';
  await configureNotifications();
  const current = await getReminderPermission();
  if (current === 'granted') return current;
  if (current === 'denied') {
    await Linking.openSettings();
    return current;
  }
  const r = await N.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
}
