import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { authApi, deviceTimezone } from '@/services/auth/authApi';
import { flushDoseOutbox, pullDoseLogs } from '@/services/sync/doseSync';
import { useAuth } from '@/store/authStore';
import { useDoseLogs } from '@/store/doseLogStore';

/**
 * Keeps dose history in sync with the server. Mount once in the signed-in shell.
 * - sends new actions ~1 s after they happen
 * - on app resume and when the connection comes back: send, then pull other devices' changes
 * - keeps the account timezone equal to the phone's, so the server counts doses on the right day
 */
export function useDoseSync() {
  const qc = useQueryClient();
  const outboxSize = useDoseLogs((s) => s.outbox.length);
  const user = useAuth((s) => s.user);

  const refreshAdherence = useCallback(() => qc.invalidateQueries({ queryKey: ['adherence'] }), [qc]);

  const lastFull = useRef(0);
  const syncAll = useCallback(async (force = false) => {
    // Throttle: resume/reconnect events can fire in bursts (and NetInfo flaps on some platforms).
    if (!force && Date.now() - lastFull.current < 20_000) return;
    lastFull.current = Date.now();
    try {
      await flushDoseOutbox();
      await pullDoseLogs();
      void refreshAdherence();
    } catch {
      // Retried on the next trigger.
    }
  }, [refreshAdherence]);

  // New actions → send shortly after.
  useEffect(() => {
    if (!outboxSize) return;
    const t = setTimeout(() => {
      flushDoseOutbox()
        .then((sent) => {
          if (sent) void refreshAdherence();
        })
        .catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [outboxSize, refreshAdherence]);

  useEffect(() => {
    void syncAll(true);
    const app = AppState.addEventListener('change', (s) => s === 'active' && void syncAll());
    // Only a real offline → online change triggers a sync. `isInternetReachable` is ignored: it
    // flips between null/false while being probed, which caused a sync every couple of seconds.
    let wasConnected: boolean | null = null;
    const net = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      if (connected && wasConnected === false) void syncAll(true);
      wasConnected = connected;
    });
    return () => {
      app.remove();
      net();
    };
  }, [syncAll]);

  // Travel / moved phone: schedules are wall-clock times in the patient's current timezone.
  useEffect(() => {
    if (!user) return;
    const tz = deviceTimezone();
    if (user.timezone === tz) return;
    authApi
      .updateProfile({ timezone: tz })
      .then((me) => useAuth.getState().setUser(me.user))
      .catch(() => {});
  }, [user]);
}
