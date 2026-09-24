import { forbidden, notFound } from './errors.js';
import type { Db } from './prisma.js';

export type CaregiverPermission =
  | 'view_adherence'
  | 'manage_medications'
  | 'verify_prescriptions'
  | 'receive_alerts';

/**
 * The single gate for every patient-scoped endpoint.
 * - A patient may access only themselves.
 * - A caregiver may access a patient only through an ACTIVE relationship that grants `permission`.
 * Unknown/unrelated patients return 404 (not 403) so ids can't be probed.
 */
export async function assertPatientAccess(
  db: Db,
  actor: { userId: string; role: 'PATIENT' | 'CAREGIVER' },
  patientId: string,
  permission: CaregiverPermission,
): Promise<void> {
  if (actor.role === 'PATIENT') {
    if (actor.userId !== patientId) throw notFound('Patient not found');
    return;
  }
  const rel = await db.caregiverRelationship.findUnique({
    where: { caregiverId_patientId: { caregiverId: actor.userId, patientId } },
  });
  if (!rel || rel.status !== 'ACTIVE') throw notFound('Patient not found');
  if (!rel.permissions.includes(permission)) throw forbidden('You do not have permission for this action');
}

/** Resolve `?patientId=` for a request: patients default to themselves; caregivers must specify. */
export function resolvePatientId(actor: { userId: string; role: 'PATIENT' | 'CAREGIVER' }, requested?: unknown) {
  if (typeof requested === 'string' && requested.length > 0) return requested;
  if (actor.role === 'PATIENT') return actor.userId;
  throw notFound('Patient not found');
}
