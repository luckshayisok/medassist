import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Expo Go on Android (SDK 53+) throws as soon as expo-notifications is *imported*, which would
 * crash the app. So the module is loaded lazily and only where it works: a development/production
 * build, or iOS Expo Go. Everywhere else reminders are simply "unsupported" and the app runs normally.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type Unsupported = 'web' | 'expo-go-android' | 'load-failed';

let cached: { mod: NotificationsModule | null; reason?: Unsupported } | undefined;

function load() {
  if (cached) return cached;
  if (Platform.OS === 'web') return (cached = { mod: null, reason: 'web' });
  if (Platform.OS === 'android' && isExpoGo) return (cached = { mod: null, reason: 'expo-go-android' });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = { mod: require('expo-notifications') as NotificationsModule };
  } catch {
    cached = { mod: null, reason: 'load-failed' };
  }
  return cached;
}

/** The expo-notifications module, or null when reminders can't work in this environment. */
export function getNotifications(): NotificationsModule | null {
  return load().mod;
}

export function unsupportedReason(): Unsupported | undefined {
  return load().reason;
}
