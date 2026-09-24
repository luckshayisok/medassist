// In-memory stand-in for the device keychain.
const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));

import { api, ApiError, NetworkError } from '../api/client';
import { loadSession, saveSession } from '../auth/tokenStorage';
import { useAuth } from '../../store/authStore';

const user = { id: 'u1', name: 'Ravi Kumar', email: 'ravi@example.com', role: 'PATIENT' as const, timezone: 'Asia/Kolkata', createdAt: '' };

const json = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const fetchMock = jest.fn();
beforeEach(() => {
  mockSecure.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useAuth.setState({ status: 'loading', user: null });
});

describe('api client', () => {
  it('sends the stored access token', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api('/me');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer A1');
  });

  it('refreshes once on 401, saves the rotated tokens, and retries', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(json(200, { user, accessToken: 'A2', refreshToken: 'R2', expiresIn: 900 }))
      .mockResolvedValueOnce(json(200, { hello: 'world' }));

    await expect(api('/me')).resolves.toEqual({ hello: 'world' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: 'R1' });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer A2');
    expect(await loadSession()).toMatchObject({ accessToken: 'A2', refreshToken: 'R2' });
  });

  it('shares one refresh between concurrent 401s (rotation would otherwise revoke the session)', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user, accessToken: 'A2', refreshToken: 'R2', expiresIn: 900 });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer A2' ? json(200, { ok: true }) : json(401, { error: { code: 'TOKEN_EXPIRED' } });
    });

    await Promise.all([api('/a'), api('/b'), api('/c')]);
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    useAuth.setState({ status: 'signedIn', user });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'REFRESH_REUSED' } }));

    await expect(api('/me')).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(await loadSession()).toBeNull();
    expect(useAuth.getState().status).toBe('signedOut');
  });

  it('maps server errors and network failures', async () => {
    fetchMock.mockResolvedValueOnce(json(422, { error: { code: 'VALIDATION_ERROR', message: 'Bad', fields: [{ path: 'email', message: 'Enter a valid email address' }] } }));
    const err = (await api('/auth/login', { method: 'POST', body: {}, auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fields?.[0]?.path).toBe('email');

    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api('/me', { auth: false })).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('auth store', () => {
  it('signs in and stores the session in secure storage', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { user, accessToken: 'A1', refreshToken: 'R1', expiresIn: 900 }));
    await useAuth.getState().signIn('ravi@example.com', 'correct horse battery');
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', user: { name: 'Ravi Kumar' } });
    expect(mockSecure.get('medassist.refreshToken')).toBe('R1');
  });

  it('stays signed in with the cached user when offline at launch', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await useAuth.getState().bootstrap();
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', user: { id: 'u1' } });
  });

  it('falls back to signed out if the keychain cannot be read (never stuck loading)', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    await useAuth.getState().bootstrap();
    expect(useAuth.getState().status).toBe('signedOut');
  });

  it('is signed out at launch with no stored session', async () => {
    await useAuth.getState().bootstrap();
    expect(useAuth.getState().status).toBe('signedOut');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs out locally even if the server is unreachable', async () => {
    await saveSession({ accessToken: 'A1', refreshToken: 'R1', user });
    useAuth.setState({ status: 'signedIn', user });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await useAuth.getState().signOut();
    expect(useAuth.getState().status).toBe('signedOut');
    expect(await loadSession()).toBeNull();
  });
});
