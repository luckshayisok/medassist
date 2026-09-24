import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { DatabaseStorage } from '../src/lib/storage.js';
import { createTestDb, patientInput, testConfig } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe('DatabaseStorage (used on Render free, which has no persistent disk)', () => {
  it('stores, reads and deletes files, rejecting unsafe keys', async () => {
    const s = new DatabaseStorage(t.db);
    const key = '11111111-1111-4111-8111-111111111111.jpg';
    await s.put(key, Buffer.from('hello'), 'image/jpeg');
    expect((await s.get(key))?.toString()).toBe('hello');
    await s.put(key, Buffer.from('replaced'), 'image/jpeg');
    expect((await s.get(key))?.toString()).toBe('replaced');
    await s.delete(key);
    expect(await s.get(key)).toBeNull();
    await expect(s.put('../../etc/passwd', Buffer.from('x'), 'text/plain')).rejects.toThrow();
    expect(await s.get('../secret')).toBeNull();
  });

  it('works end-to-end for medicine photos through the API', async () => {
    const api = request(createApp({ db: t.db, config: { ...testConfig, storageDriver: 'db' }, storage: new DatabaseStorage(t.db) }));
    const reg = await api.post('/api/v1/auth/register').send({ ...patientInput, email: 'dbstore@example.com' });
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const { body: med } = await api
      .post('/api/v1/medications')
      .set(auth)
      .send({ name: 'X', dosage: '1 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'ANY', startDate: '2026-09-01', schedule: { frequency: 'DAILY', times: ['08:00'] } });

    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff99cc' } }).png().toBuffer();
    const up = await api.post(`/api/v1/medications/${med.id}/image`).set(auth).attach('image', png, 'p.png');
    expect(up.status).toBe(200);
    expect(await t.db.storedFile.count()).toBe(1);

    const file = await api.get(up.body.imageUrl);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');

    await api.delete(`/api/v1/medications/${med.id}/image`).set(auth);
    expect(await t.db.storedFile.count()).toBe(0);
  });
});
