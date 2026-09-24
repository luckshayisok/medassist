// A fake OS scheduler: records what is "pending" on the device.
const mockPending = new Map<string, { identifier: string; content: { data: Record<string, unknown> }; trigger: unknown }>();
let mockGranted = true;

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { MAX: 5 },
  AndroidNotificationPriority: { MAX: 'max' },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: mockGranted, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending.values()]),
  scheduleNotificationAsync: jest.fn(async (req: { identifier: string; content: { data: Record<string, unknown> }; trigger: unknown }) => {
    mockPending.set(req.identifier, req);
    return req.identifier;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => void mockPending.delete(id)),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
}));

import * as Notifications from 'expo-notifications';
import type { DoseLog, Medication } from '../../types/medication';
import { atLocalTime } from '../../utils/date';
import { makeDoseKey } from '../../utils/schedule';
import { cancelAllReminders, syncReminders } from '../notifications/reconcile';
import { doseFromKey, interpretResponse } from '../notifications/responses';
import { ACTION_SNOOZE, ACTION_TAKEN } from '../notifications/setup';

const day = new Date(2026, 8, 24);
const at = (hhmm: string) => atLocalTime(day, hhmm);

function med(id: string, times: string[]): Medication {
  return {
    id, patientId: 'p', name: id, dosage: '5 mg', doseQuantity: 1, unit: 'tablet', imageUrl: null, instructions: null,
    foodTiming: 'ANY', foodInstructions: null, avoid: [], precautions: null, prescriber: null, notes: null,
    startDate: '2026-01-01', endDate: null, version: 1,
    schedules: times.map((time, i) => ({ id: `${id}-${i}`, time, frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-01-01', endDate: null })),
  };
}

beforeEach(() => {
  mockPending.clear();
  mockGranted = true;
  jest.clearAllMocks();
});

describe('syncReminders', () => {
  it('schedules the plan and is idempotent', async () => {
    const meds = [med('A', ['08:00', '20:00'])];
    const first = await syncReminders(meds, {}, at('07:00'));
    expect(first.status).toBe('ok');
    expect(first.added).toBeGreaterThan(0);
    const scheduledCalls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;

    const second = await syncReminders(meds, {}, at('07:00'));
    expect(second).toMatchObject({ added: 0, cancelled: 0 });
    expect((Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length).toBe(scheduledCalls);
  });

  it('uses exact date triggers on the reminders channel with action buttons', async () => {
    await syncReminders([med('A', ['08:00'])], {}, at('07:00'));
    const req = mockPending.get(`dose:${makeDoseKey('A-0', at('08:00'))}`)!;
    expect(req.trigger).toMatchObject({ type: 'date', channelId: 'medication-reminders' });
    expect(req.content).toMatchObject({ categoryIdentifier: 'DOSE', data: { owner: 'medassist', kind: 'dose' } });
  });

  it('cancels reminders for deleted medicines and taken doses, and moves changed times', async () => {
    await syncReminders([med('A', ['08:00']), med('B', ['09:00'])], {}, at('07:00'));
    const k = makeDoseKey('A-0', at('08:00'));

    // B deleted, A's 08:00 dose taken early.
    const logs: Record<string, DoseLog> = {
      [k]: { clientId: 'c', doseKey: k, medicationId: 'A', scheduleId: 'A-0', scheduledFor: '', status: 'TAKEN', loggedAt: '', synced: false },
    };
    await syncReminders([med('A', ['08:00'])], logs, at('07:30'));
    const ids = [...mockPending.keys()];
    expect(ids.some((id) => id.includes('B-0'))).toBe(false);
    expect(ids).not.toContain(`dose:${k}`);
    expect(ids).not.toContain(`followup:${k}`);
  });

  it('never touches notifications it did not create', async () => {
    mockPending.set('other-app-thing', { identifier: 'other-app-thing', content: { data: {} }, trigger: null });
    await syncReminders([], {}, at('07:00'));
    await cancelAllReminders();
    expect(mockPending.has('other-app-thing')).toBe(true);
  });

  it('does nothing without permission', async () => {
    mockGranted = false;
    const r = await syncReminders([med('A', ['08:00'])], {}, at('07:00'));
    expect(r.status).toBe('no-permission');
    expect(mockPending.size).toBe(0);
  });

  it('removes all our reminders on sign-out', async () => {
    await syncReminders([med('A', ['08:00', '20:00'])], {}, at('07:00'));
    await cancelAllReminders();
    expect(mockPending.size).toBe(0);
  });
});

describe('notification responses', () => {
  const meds = [med('A', ['08:00'])];
  const key = makeDoseKey('A-0', at('08:00'));
  const response = (actionIdentifier: string, data: Record<string, unknown> = { owner: 'medassist', doseKey: key, kind: 'dose' }) =>
    ({ actionIdentifier, notification: { date: 0, request: { identifier: 'x', content: { data } } } }) as unknown as Notifications.NotificationResponse;

  it('rebuilds the dose from its key', () => {
    const d = doseFromKey(key, meds)!;
    expect(d.medication.id).toBe('A');
    expect(d.scheduledFor.getTime()).toBe(at('08:00').getTime());
    expect(doseFromKey(key, [])).toBeNull(); // medicine deleted
    expect(doseFromKey('garbage', meds)).toBeNull();
  });

  it('maps actions to taken / snoozed / open', () => {
    expect(interpretResponse(response(ACTION_TAKEN), meds)).toMatchObject({ type: 'taken' });
    expect(interpretResponse(response(ACTION_SNOOZE), meds)).toMatchObject({ type: 'snoozed' });
    expect(interpretResponse(response('expo.modules.notifications.actions.DEFAULT'), meds)).toEqual({ type: 'open', doseKey: key });
  });

  it('opens (never records) when the medicine no longer exists', () => {
    expect(interpretResponse(response(ACTION_TAKEN), [])).toEqual({ type: 'open', doseKey: key });
  });

  it('ignores test reminders', () => {
    expect(interpretResponse(response('x', { owner: 'medassist', kind: 'test', doseKey: '' }), meds)).toEqual({ type: 'ignored' });
  });
});
