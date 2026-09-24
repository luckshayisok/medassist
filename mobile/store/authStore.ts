import { create } from 'zustand';
import { setSessionExpiredHandler } from '@/services/api/client';
import { authApi, deviceTimezone, type RegisterInput } from '@/services/auth/authApi';
import { clearQueryCache } from '@/lib/queryClient';
import { clearSession, loadSession, saveSession } from '@/services/auth/tokenStorage';
import { clearCareNotified } from '@/services/care/alertNotifier';
import { unregisterReminderRefresh } from '@/services/notifications/background';
import { cancelAllReminders } from '@/services/notifications/reconcile';
import { useDoseLogs } from '@/store/doseLogStore';
import type { AuthSession, User } from '@/types/auth';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: Omit<RegisterInput, 'timezone'>) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuth = create<AuthState>()((set, get) => {
  const startSession = async (s: AuthSession) => {
    await saveSession(s);
    set({ status: 'signedIn', user: s.user });
  };
  const endSession = async () => {
    // Remove every trace of this user's health data from the device.
    await Promise.all([
      clearSession(),
      clearQueryCache().catch(() => {}),
      // No reminders for a signed-out user (they'd reveal medicine names on the lock screen).
      cancelAllReminders().catch(() => {}),
      unregisterReminderRefresh().catch(() => {}),
      clearCareNotified().catch(() => {}),
    ]);
    useDoseLogs.setState({ logs: {} });
    set({ status: 'signedOut', user: null });
  };

  setSessionExpiredHandler(() => set({ status: 'signedOut', user: null }));

  return {
    status: 'loading',
    user: null,

    /**
     * Offline-first: if a session is stored, the patient is signed in immediately with the cached
     * user so reminders and today's schedule work without internet. The server check runs after.
     */
    bootstrap: async () => {
      // A keychain read failure must never leave the app stuck on the loading screen.
      const stored = await loadSession().catch(() => null);
      if (!stored) {
        set({ status: 'signedOut', user: null });
        return;
      }
      set({ status: 'signedIn', user: stored.user });
      try {
        const me = await authApi.me();
        set({ user: me.user });
        const latest = await loadSession();
        if (latest) await saveSession({ ...latest, user: me.user });
      } catch {
        // Stay signed in when offline or the server errors; the API client has already signed us
        // out if the session is truly dead (refresh rejected).
      }
    },

    signIn: async (email, password) => startSession(await authApi.login(email, password)),

    signUp: async (input) => startSession(await authApi.register({ ...input, timezone: deviceTimezone() })),

    signOut: async () => {
      const stored = await loadSession();
      // Best effort: revoke server-side, but always sign out locally.
      if (stored) await authApi.logout(stored.refreshToken).catch(() => {});
      await endSession();
    },

    deleteAccount: async (password) => {
      await authApi.deleteAccount(password);
      await endSession();
    },

    setUser: (user) => {
      if (get().status === 'signedIn') set({ user });
    },
  };
});
