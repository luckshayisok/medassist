import type { CareAlert } from '../../api/care';
import { alertText, newAlerts } from '../alertNotifier';

const alert = (id: string, seen = false): CareAlert => ({
  id,
  patientId: 'p1',
  patientName: 'Asha Verma',
  medication: 'Metformin',
  scheduledFor: '2026-09-25T02:30:00.000Z',
  seen,
});

describe('care alert notifications', () => {
  it('notifies only alerts that are new and not yet checked', () => {
    const list = [alert('a'), alert('b', true), alert('c')];
    expect(newAlerts(list, ['a']).map((x) => x.id)).toEqual(['c']);
    expect(newAlerts(list, ['a', 'c'])).toEqual([]);
  });

  it('uses calm, clear wording with the person and the medicine', () => {
    const t = alertText(alert('a'));
    expect(t.title).toBe('Asha Verma may have missed a dose');
    expect(t.body).toMatch(/^Metformin at .+ wasn't marked as taken\./);
  });
});
