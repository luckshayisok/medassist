import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useMedicationList } from '@/hooks/useMedications';
import { useDoseLogs } from '@/store/doseLogStore';
import { summarize } from '@/utils/adherence';
import { expandDay, pickNextDose } from '@/utils/schedule';

/** Current time, refreshed every 30 s and whenever the app returns to the foreground. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(new Date()));
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}

export function useTodayDoses() {
  const now = useNow();
  const medications = useMedicationList();
  const logs = useDoseLogs((s) => s.logs);

  return useMemo(() => {
    const events = expandDay(medications, now, logs, now);
    return {
      now,
      medications,
      events,
      next: pickNextDose(events, now),
      summary: summarize(events),
    };
  }, [medications, logs, now]);
}

export function useDose(doseKey: string | undefined) {
  const { events, now } = useTodayDoses();
  return { dose: events.find((e) => e.doseKey === doseKey), now };
}
