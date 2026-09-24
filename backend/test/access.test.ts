import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertPatientAccess } from '../src/lib/access.js';
import { createTestDb } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestDb>>;
const ids = {} as Record<'patient' | 'other' | 'active' | 'pending' | 'revoked' | 'limited' | 'stranger', string>;

beforeAll(async () => {
  t = await createTestDb();
  const mk = async (key: keyof typeof ids, role: 'PATIENT' | 'CAREGIVER') => {
    const u = await t.db.user.create({ data: { name: key, email: `${key}@x.com`, passwordHash: 'x', role } });
    ids[key] = u.id;
  };
  await mk('patient', 'PATIENT');
  await mk('other', 'PATIENT');
  for (const k of ['active', 'pending', 'revoked', 'limited', 'stranger'] as const) await mk(k, 'CAREGIVER');

  const all = ['view_adherence', 'manage_medications', 'verify_prescriptions', 'receive_alerts'];
  await t.db.caregiverRelationship.createMany({
    data: [
      { caregiverId: ids.active, patientId: ids.patient, status: 'ACTIVE', permissions: all },
      { caregiverId: ids.pending, patientId: ids.patient, status: 'PENDING', permissions: all },
      { caregiverId: ids.revoked, patientId: ids.patient, status: 'REVOKED', permissions: all },
      { caregiverId: ids.limited, patientId: ids.patient, status: 'ACTIVE', permissions: ['view_adherence'] },
    ],
  });
});
afterAll(() => t.close());

const check = (who: keyof typeof ids, role: 'PATIENT' | 'CAREGIVER', patient: string, perm: 'view_adherence' | 'manage_medications' = 'view_adherence') =>
  assertPatientAccess(t.db, { userId: ids[who], role }, patient, perm);

describe('assertPatientAccess', () => {
  it('lets a patient access only themselves', async () => {
    await expect(check('patient', 'PATIENT', ids.patient)).resolves.toBeUndefined();
    await expect(check('patient', 'PATIENT', ids.other)).rejects.toMatchObject({ status: 404 });
  });

  it('allows an active caregiver with the permission', async () => {
    await expect(check('active', 'CAREGIVER', ids.patient, 'manage_medications')).resolves.toBeUndefined();
  });

  it.each(['pending', 'revoked', 'stranger'] as const)('hides the patient from a %s caregiver (404)', async (who) => {
    await expect(check(who, 'CAREGIVER', ids.patient)).rejects.toMatchObject({ status: 404 });
  });

  it('forbids actions outside the granted permissions', async () => {
    await expect(check('limited', 'CAREGIVER', ids.patient, 'view_adherence')).resolves.toBeUndefined();
    await expect(check('limited', 'CAREGIVER', ids.patient, 'manage_medications')).rejects.toMatchObject({ status: 403 });
  });

  it('does not extend a caregiver to other patients', async () => {
    await expect(check('active', 'CAREGIVER', ids.other)).rejects.toMatchObject({ status: 404 });
  });
});
