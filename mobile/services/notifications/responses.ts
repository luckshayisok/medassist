import type { NotificationResponse } from 'expo-notifications';
import type { DoseEvent, Medication } from '@/types/medication';
import { ACTION_SNOOZE, ACTION_TAKEN } from './setup';

export type ResponseOutcome =
  | { type: 'open'; doseKey: string }
  | { type: 'taken'; dose: DoseEvent }
  | { type: 'snoozed'; dose: DoseEvent }
  | { type: 'ignored' };

/** Rebuild the dose a notification refers to from its key ("<scheduleId>@<ISO time>"). */
export function doseFromKey(doseKey: string, medications: Medication[]): DoseEvent | null {
  const at = doseKey.lastIndexOf('@');
  if (at < 0) return null;
  const scheduleId = doseKey.slice(0, at);
  const scheduledFor = new Date(doseKey.slice(at + 1));
  if (Number.isNaN(scheduledFor.getTime())) return null;
  const medication = medications.find((m) => m.schedules.some((s) => s.id === scheduleId));
  if (!medication) return null; // medicine deleted since the reminder was scheduled
  return { doseKey, medication, scheduleId, scheduledFor, status: 'DUE_NOW' };
}

/** Decide what a tap / action button on a reminder should do. Pure apart from reading the payload. */
export function interpretResponse(response: NotificationResponse, medications: Medication[]): ResponseOutcome {
  const data = response.notification.request.content.data as { owner?: string; doseKey?: string; kind?: string } | null;
  if (!data?.doseKey || data.kind === 'test') return { type: 'ignored' };
  const dose = doseFromKey(data.doseKey, medications);

  if (response.actionIdentifier === ACTION_TAKEN && dose) return { type: 'taken', dose };
  if (response.actionIdentifier === ACTION_SNOOZE && dose) return { type: 'snoozed', dose };
  return { type: 'open', doseKey: data.doseKey };
}
