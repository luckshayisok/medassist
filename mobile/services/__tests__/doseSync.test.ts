const mockApi = jest.fn();
jest.mock('../api/client', () => {
  class NetworkError extends Error {}
  return { api: (...args: unknown[]) => mockApi(...args), NetworkError };
});

import type { DoseEvent, Medication } from '../../types/medication';
import { doseKeyOf, useDoseLogs } from '../../store/doseLogStore';
import { NetworkError } from '../api/client';
import { flushDoseOutbox } from '../sync/doseSync';

const dose = (iso: string): DoseEvent => ({
  doseKey: doseKeyOf('s1', iso),
  medication: { id: 'm1' } as Medication,
  scheduleId: 's1',
  scheduledFor: new Date(iso),
  status: 'DUE_NOW',
});

beforeEach(() => {
  mockApi.mockReset();
  useDoseLogs.setState({ logs: {}, outbox: [] });
});

describe('flushDoseOutbox', () => {
  it('still sends after an earlier flush found the outbox empty (stale single-flight regression)', async () => {
    await expect(flushDoseOutbox()).resolves.toBe(false); // empty → finishes synchronously
    useDoseLogs.getState().markTaken(dose('2026-09-24T02:30:00.000Z'));
    const { clientId } = useDoseLogs.getState().outbox[0]!;
    mockApi.mockResolvedValueOnce({ results: [{ clientId, result: 'applied' }] });

    await expect(flushDoseOutbox()).resolves.toBe(true);
    expect(mockApi).toHaveBeenCalledWith('/dose-logs/sync', expect.objectContaining({ method: 'POST' }));
    expect(useDoseLogs.getState().outbox).toEqual([]);
  });

  it('shares one request between concurrent calls', async () => {
    useDoseLogs.getState().markTaken(dose('2026-09-24T02:30:00.000Z'));
    const { clientId } = useDoseLogs.getState().outbox[0]!;
    mockApi.mockResolvedValueOnce({ results: [{ clientId, result: 'applied' }] });
    await Promise.all([flushDoseOutbox(), flushDoseOutbox(), flushDoseOutbox()]);
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('keeps the outbox when offline, then sends on the next try', async () => {
    useDoseLogs.getState().markTaken(dose('2026-09-24T02:30:00.000Z'));
    mockApi.mockRejectedValueOnce(new NetworkError());
    await expect(flushDoseOutbox()).resolves.toBe(false);
    expect(useDoseLogs.getState().outbox).toHaveLength(1);

    const { clientId } = useDoseLogs.getState().outbox[0]!;
    mockApi.mockResolvedValueOnce({ results: [{ clientId, result: 'applied' }] });
    await expect(flushDoseOutbox()).resolves.toBe(true);
    expect(useDoseLogs.getState().outbox).toHaveLength(0);
  });
});
