import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careApi, caregiversApi, type Grantable } from '@/services/api/care';
import { notifyCareAlerts } from '@/services/care/alertNotifier';
import { useAuth } from '@/store/authStore';

const isCaregiver = () => useAuth.getState().user?.role === 'CAREGIVER';

// ─── Caregiver side ──────────────────────────────────────────────────────────

export function useCaredPeople() {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: ['care', 'patients'], queryFn: careApi.patients, enabled: role === 'CAREGIVER', refetchInterval: 5 * 60_000 });
}

export function useCaredPerson(id: string | undefined) {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: ['care', 'patient', id], queryFn: () => careApi.patient(id!), enabled: role === 'CAREGIVER' && !!id, refetchInterval: 5 * 60_000 });
}

/** Missed-dose alerts. Checked every few minutes while the app is open; new ones also buzz the phone. */
export function useCareAlerts() {
  const role = useAuth((s) => s.user?.role);
  return useQuery({
    queryKey: ['care', 'alerts'],
    queryFn: async () => {
      const alerts = await careApi.alerts();
      if (isCaregiver()) void notifyCareAlerts(alerts).catch(() => {});
      return alerts;
    },
    enabled: role === 'CAREGIVER',
    refetchInterval: 5 * 60_000,
  });
}

export function useMarkAlertsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => careApi.markSeen(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care', 'alerts'] }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => careApi.accept(code),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care'] }),
  });
}

export function useLeavePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => careApi.leave(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care'] }),
  });
}

// ─── Patient side ────────────────────────────────────────────────────────────

export function useMyCaregivers() {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: ['caregivers'], queryFn: caregiversApi.list, enabled: role === 'PATIENT' });
}

export function useCaregiverActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['caregivers'] });
  return {
    invite: useMutation({ mutationFn: (p: Grantable[]) => caregiversApi.invite(p), onSuccess: refresh }),
    cancelInvite: useMutation({ mutationFn: caregiversApi.cancelInvite, onSuccess: refresh }),
    setPermissions: useMutation({ mutationFn: (v: { id: string; permissions: Grantable[] }) => caregiversApi.setPermissions(v.id, v.permissions), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => caregiversApi.remove(id), onSuccess: refresh }),
  };
}
