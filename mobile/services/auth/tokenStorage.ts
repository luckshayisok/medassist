import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { User } from '@/types/auth';

// Keychain (iOS) / Keystore-backed EncryptedSharedPreferences (Android). Never AsyncStorage.
// AFTER_FIRST_UNLOCK lets background sync (Phase 12) read the token while the phone is locked.
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// SecureStore has no web implementation. Web is only used for design previews, so keep the
// session in memory there (lost on reload) rather than in insecure browser storage.
const memory = new Map<string, string>();
const store =
  Platform.OS === 'web'
    ? {
        set: async (k: string, v: string) => void memory.set(k, v),
        get: async (k: string) => memory.get(k) ?? null,
        del: async (k: string) => void memory.delete(k),
      }
    : {
        set: (k: string, v: string) => SecureStore.setItemAsync(k, v, OPTS),
        get: (k: string) => SecureStore.getItemAsync(k, OPTS),
        del: (k: string) => SecureStore.deleteItemAsync(k, OPTS),
      };

const KEYS = {
  access: 'medassist.accessToken',
  refresh: 'medassist.refreshToken',
  user: 'medassist.user',
} as const;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export async function saveSession(s: StoredSession) {
  await Promise.all([
    store.set(KEYS.access, s.accessToken),
    store.set(KEYS.refresh, s.refreshToken),
    store.set(KEYS.user, JSON.stringify(s.user)),
  ]);
}

export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, userJson] = await Promise.all([
    store.get(KEYS.access),
    store.get(KEYS.refresh),
    store.get(KEYS.user),
  ]);
  if (!accessToken || !refreshToken || !userJson) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(userJson) as User };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Promise.all(Object.values(KEYS).map((k) => store.del(k)));
}
