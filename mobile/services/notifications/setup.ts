import { Platform } from 'react-native';
import { getNotifications } from './module';

export const CHANNEL_ID = 'medication-reminders';
export const CATEGORY_DOSE = 'DOSE';
export const ACTION_TAKEN = 'TAKEN';
export const ACTION_SNOOZE = 'SNOOZE_10';
/** Marks notifications we own, so reconciling never touches anything else. */
export const OWNER = 'medassist';

/** False on web and in Expo Go on Android — see services/notifications/module.ts. */
export function notificationsSupported(): boolean {
  return getNotifications() !== null;
}

let configured: Promise<void> | null = null;

/** Idempotent: channel, action buttons and foreground behaviour. Safe to call often. */
export function configureNotifications(): Promise<void> {
  const N = getNotifications();
  if (!N) return Promise.resolve();
  configured ??= (async () => {
    // Show reminders even while the app is open — the patient may be on another screen.
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      // Must exist before asking for permission on Android 13+, or the prompt won't show.
      await N.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Medicine reminders',
        description: 'Reminders when it is time to take a medicine',
        importance: N.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 400, 250, 400],
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
    }

    // Both actions open the app so the patient sees a clear confirmation of what was recorded.
    await N.setNotificationCategoryAsync(CATEGORY_DOSE, [
      { identifier: ACTION_TAKEN, buttonTitle: '✓ I took it', options: { opensAppToForeground: true } },
      { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 10 min', options: { opensAppToForeground: true } },
    ]);
  })().catch((e) => {
    configured = null; // allow a retry next time
    throw e;
  });
  return configured;
}
