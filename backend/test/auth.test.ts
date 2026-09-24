import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/modules/auth/tokens.js';
import { createTestDb, makeApi, patientInput, testConfig } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof makeApi>;

beforeAll(async () => {
  t = await createTestDb();
  api = makeApi(t.db);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const register = (overrides: Partial<typeof patientInput> = {}) =>
  api.post('/api/v1/auth/register').send({ ...patientInput, ...overrides });

describe('POST /auth/register', () => {
  it('creates a patient with a profile and returns a session', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ravi Kumar', email: 'ravi@example.com', role: 'PATIENT', timezone: 'Asia/Kolkata' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));

    const user = await t.db.user.findUniqueOrThrow({ where: { email: 'ravi@example.com' }, include: { patientProfile: true } });
    expect(user.patientProfile).not.toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    // Refresh tokens are stored only as hashes.
    const stored = await t.db.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashToken(res.body.refreshToken));
  });

  it('does not create a patient profile for caregivers', async () => {
    const res = await register({ role: 'CAREGIVER', email: 'care@example.com' });
    expect(res.status).toBe(201);
    const user = await t.db.user.findUniqueOrThrow({ where: { email: 'care@example.com' }, include: { patientProfile: true } });
    expect(user.patientProfile).toBeNull();
  });

  it('normalizes email and rejects duplicates case-insensitively', async () => {
    await register();
    const res = await register({ email: '  RAVI@Example.com ' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    [{ email: 'not-an-email' }, 'email'],
    [{ password: 'short' }, 'password'],
    [{ name: '' }, 'name'],
    [{ role: 'ADMIN' }, 'role'],
    [{ timezone: 'Mars/Olympus' }, 'timezone'],
  ])('validates input %j', async (bad, field) => {
    const res = await register(bad as never);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await api.post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => register());

  it('logs in with correct credentials (email case-insensitive)', async () => {
    const res = await api.post('/api/v1/auth/login').send({ email: 'Ravi@Example.com', password: patientInput.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ravi@example.com');
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrong = await api.post('/api/v1/auth/login').send({ email: patientInput.email, password: 'wrong password' });
    const unknown = await api.post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe('access tokens', () => {
  it('protects /me', async () => {
    expect((await api.get('/api/v1/me')).status).toBe(401);
    expect((await api.get('/api/v1/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  it('rejects tokens signed with another secret or expired', async () => {
    const { body } = await register();
    const forged = jwt.sign({ role: 'PATIENT' }, 'another-secret-another-secret-another', {
      subject: body.user.id, issuer: 'medassist-api', audience: 'medassist-app',
    });
    expect((await api.get('/api/v1/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);

    const expired = jwt.sign({ role: 'PATIENT' }, testConfig.jwtAccessSecret, {
      subject: body.user.id, issuer: 'medassist-api', audience: 'medassist-app', expiresIn: -10,
    });
    const res = await api.get('/api/v1/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects alg:none tokens', async () => {
    const { body } = await register();
    const none = jwt.sign({ role: 'PATIENT' }, '', { algorithm: 'none', subject: body.user.id, issuer: 'medassist-api', audience: 'medassist-app' });
    expect((await api.get('/api/v1/me').set('Authorization', `Bearer ${none}`)).status).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates and invalidates the old token', async () => {
    const { body: s1 } = await register();
    const r1 = await api.post('/api/v1/auth/refresh').send({ refreshToken: s1.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s1.refreshToken);

    const me = await api.get('/api/v1/me').set('Authorization', `Bearer ${r1.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const { body: s1 } = await register();
    const r1 = await api.post('/api/v1/auth/refresh').send({ refreshToken: s1.refreshToken });

    const reuse = await api.post('/api/v1/auth/refresh').send({ refreshToken: s1.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    // The legitimately rotated token is now dead too.
    const next = await api.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(next.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const { body } = await register();
    expect((await api.post('/api/v1/auth/logout').send({ refreshToken: body.refreshToken })).status).toBe(204);
    expect((await api.post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);
  });

  it('rejects expired refresh tokens', async () => {
    const { body } = await register();
    await t.db.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api.post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_EXPIRED');
  });
});

describe('/me', () => {
  it('returns and updates the profile, merging accessibility settings', async () => {
    const { body } = await register();
    const auth = { Authorization: `Bearer ${body.accessToken}` };

    const get = await api.get('/api/v1/me').set(auth);
    expect(get.body.profile).toMatchObject({ dateOfBirth: null, accessibilitySettings: {} });

    await api.patch('/api/v1/me/profile').set(auth).send({ accessibilitySettings: { textSize: 'xl' } });
    const res = await api
      .patch('/api/v1/me/profile')
      .set(auth)
      .send({ name: 'Ravi K', dateOfBirth: '1950-03-14', emergencyContactPhone: '+91 98765 43210', accessibilitySettings: { highContrast: true } });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Ravi K');
    expect(res.body.profile).toMatchObject({
      dateOfBirth: '1950-03-14',
      emergencyContactPhone: '+91 98765 43210',
      accessibilitySettings: { textSize: 'xl', highContrast: true },
    });
  });

  it('rejects unknown fields (no mass assignment)', async () => {
    const { body } = await register();
    const res = await api.patch('/api/v1/me/profile').set('Authorization', `Bearer ${body.accessToken}`).send({ role: 'CAREGIVER' });
    expect(res.status).toBe(422);
  });

  it('deletes the account only with the correct password', async () => {
    const { body } = await register();
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    expect((await api.delete('/api/v1/me').set(auth).send({ password: 'nope' })).status).toBe(401);
    expect((await api.delete('/api/v1/me').set(auth).send({ password: patientInput.password })).status).toBe(204);
    expect(await t.db.user.count()).toBe(0);
    expect(await t.db.refreshToken.count()).toBe(0);
    const login = await api.post('/api/v1/auth/login').send({ email: patientInput.email, password: patientInput.password });
    expect(login.status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('limits repeated login attempts', async () => {
    const limited = makeApi(t.db, { authRateLimit: 3 });
    const attempt = () => limited.post('/api/v1/auth/login').send({ email: 'x@example.com', password: 'whatever1' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
