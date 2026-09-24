import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { useMedicationList } from '@/hooks/useMedications';
import { registerReminderRefresh } from '@/services/notifications/background';
import { getReminderPermission, requestReminderPermission, type ReminderPermission } from '@/services/notifications/permissions';
import { syncReminders, type SyncResult } from '@/services/notifications/reconcile';
import { interpretResponse } from '@/services/notifications/responses';
import { getNotifications } from '@/services/notifications/module';
import { notificationsSupported } from '@/services/notifications/setup';
import { useDoseLogs } from '@/store/doseLogStore';

interface ReminderState {
  permission: ReminderPermission | 'loading';
  lastSync: SyncResult | null;
  refreshPermission: () => Promise<void>;
  requestPermission: () => Promise<ReminderPermission>;
}

export const useReminderState = create<ReminderState>()((set) => ({
  permission: notificationsSupported() ? 'loading' : 'unsupported',
  lastSync: null,
  refreshPermission: async () => set({ permission: await getReminderPermission() }),
  requestPermission: async () => {
    const permission = await requestReminderPermission();
    set({ permission });
    return permission;
  },
}));

/**
 * Keeps OS reminders in sync with the medicine plan and routes taps on reminders.
 * Mount once, inside the signed-in part of the app.
 */
export function useReminders() {
  const medications = useMedicationList();
  const logs = useDoseLogs((s) => s.logs);
  const permission = useReminderState((s) => s.permission);
  const handled = useRef(new Set<string>());
  const medsRef = useRef(medications);
  medsRef.current = medications;

  const sync = useCallback(async () => {
    try {
      const result = await syncReminders(medsRef.current, useDoseLogs.getState().logs);
      useReminderState.setState({ lastSync: result });
    } catch {
      // A failed sync is retried on the next change or app resume.
    }
  }, []);

  // Re-plan whenever the medicine list, a dose log or the permission changes (debounced).
  useEffect(() => {
    if (!notificationsSupported()) return;
    const t = setTimeout(sync, 400);
    return () => clearTimeout(t);
  }, [medications, logs, permission, sync]);

  // On resume: permission may have changed in Settings, the timezone may have changed, and the
  // rolling window needs topping up.
  useEffect(() => {
    if (!notificationsSupported()) return;
    void useReminderState.getState().refreshPermission();
    registerReminderRefresh().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void useReminderState.getState().refreshPermission();
        void sync();
      }
    });
    return () => sub.remove();
  }, [sync]);

  // Taps and action buttons — including the one that cold-started the app.
  useEffect(() => {
    const N = getNotifications();
    if (!N) return;
    const handle = (response: NotificationResponse | null) => {
      if (!response) return;
      const id = `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
      if (handled.current.has(id)) return;
      handled.current.add(id);

      const outcome = interpretResponse(response, medsRef.current);
      const logsApi = useDoseLogs.getState();
      if (outcome.type === 'taken') {
        logsApi.markTaken(outcome.dose);
        router.push({ pathname: '/reminder/[doseKey]', params: { doseKey: outcome.dose.doseKey } });
      } else if (outcome.type === 'snoozed') {
        logsApi.snooze(outcome.dose, 10);
      } else if (outcome.type === 'open') {
        router.push({ pathname: '/reminder/[doseKey]', params: { doseKey: outcome.doseKey } });
      }
      void N.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
      N.clearLastNotificationResponse();
    };

    handle(N.getLastNotificationResponse());
    const sub = N.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
