import { clearSession, loadSession, saveSession } from '@/services/auth/tokenStorage';
import type { AuthSession } from '@/types/auth';

/**
 * Set EXPO_PUBLIC_API_URL in mobile/.env. On a physical phone use your computer's LAN IP
 * (e.g. http://192.168.1.20:4000); the Android emulator reaches the host at 10.0.2.2.
 */
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(/\/$/, '');
export const API_URL = API_ORIGIN + '/api/v1';

/** The API returns private files as relative signed paths; make them loadable. */
export function resolveFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : API_ORIGIN + path;
}

// Generous: a free-tier server (Render) can take ~50 s to wake from sleep on the first request.
const TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** The device is offline or the server is unreachable. Callers should fall back to local data. */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach MedAssist right now. Check your internet connection.");
  }
}

/** The server was reached (or may have been) but did not answer in time. */
export class TimeoutError extends NetworkError {
  constructor() {
    super();
    this.message = 'MedAssist is taking too long to answer. Please try again in a moment.';
  }
}

let onSessionExpired: (() => void) | undefined;
/** Registered by the auth store: called when the refresh token is no longer valid. */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function rawFetch(path: string, init: RequestInit & { token?: string; timeoutMs?: number }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, init.timeoutMs ?? TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // FormData sets its own multipart boundary header.
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw timedOut ? new TimeoutError() : new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; fields?: [] } } | null;
  return new ApiError(
    res.status,
    body?.error?.code ?? 'UNKNOWN',
    body?.error?.message ?? 'Something went wrong. Please try again.',
    body?.error?.fields,
  );
}

// Single-flight: concurrent 401s share one refresh request (rotation makes parallel refreshes fatal).
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  const run = (async () => {
      const session = await loadSession();
      if (!session) return null;
      const res = await rawFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) });
      if (res.status === 401) {
        await clearSession();
        onSessionExpired?.();
        return null;
      }
      if (!res.ok) throw await toError(res);
      const next = (await res.json()) as AuthSession;
      await saveSession(next);
      return next.accessToken;
  })();
  // Clear only after assigning (see flushDoseOutbox for why clearing inside the fn is unsafe).
  refreshing = run;
  void run
    .finally(() => {
      if (refreshing === run) refreshing = null;
    })
    .catch(() => {});
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the stored access token (default true). */
  auth?: boolean;
  /** Override the default 60 s limit (e.g. AI calls that can be slow on the free tier). */
  timeoutMs?: number;
}

export async function api<T>(path: string, { method = 'GET', body, auth = true, timeoutMs }: RequestOptions = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const init = { method, timeoutMs, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) };
  let token = auth ? (await loadSession())?.accessToken : undefined;
  let res = await rawFetch(path, { ...init, token });

  if (auth && res.status === 401) {
    token = (await refreshAccessToken()) ?? undefined;
    if (!token) throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in again.');
    res = await rawFetch(path, { ...init, token });
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
