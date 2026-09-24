import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api/client';
import { useAuth } from '@/store/authStore';

export interface Tally {
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  late: number;
  percent: number | null;
}

export interface AdherenceReport {
  timezone: string;
  from: string;
  to: string;
  totals: Tally;
  days: ({ date: string } & Tally)[];
  medications: ({ id: string; name: string; dosage: string; deleted: boolean } & Tally)[];
  insights: { kind: string; text: string }[];
}

export type AdherenceRange = 'weekly' | 'monthly';

/** Server-computed adherence (the server knows every device's logs and the patient's timezone). */
export function useAdherence(range: AdherenceRange) {
  const user = useAuth((s) => s.user);
  return useQuery({
    queryKey: ['adherence', user?.id, range],
    queryFn: () => api<AdherenceReport>(`/adherence/${range}`),
    enabled: user?.role === 'PATIENT',
    staleTime: 30_000,
  });
}
