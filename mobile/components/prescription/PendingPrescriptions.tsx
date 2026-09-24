import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, CircleAlert, ClipboardCheck } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { prescriptionsApi } from '@/services/api/prescriptions';
import { useAuth } from '@/store/authStore';
import type { Prescription } from '@/types/prescription';

export const prescriptionsKey = (userId?: string) => ['prescriptions', userId];

const OPEN: Prescription['status'][] = ['UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'FAILED'];

/** Scans that still need the patient: being read, waiting for review, or failed. */
export function usePendingPrescriptions() {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: prescriptionsKey(user?.id),
    queryFn: prescriptionsApi.list,
    enabled: user?.role === 'PATIENT',
    refetchInterval: (query) => (query.state.data?.some((p) => p.status === 'UPLOADED' || p.status === 'PROCESSING') ? 3000 : false),
    select: openOnly,
  });
  return q.data ?? [];
}

// Only recent failures are worth a nudge; older ones are noise.
function openOnly(list: Prescription[]) {
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  return list.filter((p) => OPEN.includes(p.status) && (p.status !== 'FAILED' || Date.parse(p.createdAt) > weekAgo));
}

function copy(p: Prescription) {
  const n = p.medications.length;
  switch (p.status) {
    case 'NEEDS_REVIEW':
      return { title: `${n} ${n === 1 ? 'medicine' : 'medicines'} ready to check`, sub: 'Confirm them to start reminders' };
    case 'FAILED':
      return { title: "We couldn't read a prescription", sub: 'Tap to try again or type it in' };
    default:
      return { title: 'Reading your prescription…', sub: 'This can take up to a minute' };
  }
}

export function PendingPrescriptions() {
  const pending = usePendingPrescriptions();
  if (!pending.length) return null;
  return (
    <View className="gap-3">
      {pending.map((p) => {
        const { title, sub } = copy(p);
        const reading = p.status === 'UPLOADED' || p.status === 'PROCESSING';
        return (
          <Pressable
            key={p.id}
            role="button"
            accessibilityLabel={`${title}. ${sub}`}
            onPress={() => router.push({ pathname: '/prescription/[id]', params: { id: p.id } })}
            className={cn(
              'min-h-20 flex-row items-center gap-3 rounded-[28px] p-4 active:opacity-80',
              p.status === 'FAILED' ? 'border-2 border-destructive bg-destructive-soft' : 'bg-blush',
            )}
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-card">
              {reading ? (
                <ActivityIndicator />
              ) : (
                <Icon as={p.status === 'FAILED' ? CircleAlert : ClipboardCheck} size={24} className={p.status === 'FAILED' ? 'text-destructive' : 'text-foreground'} />
              )}
            </View>
            <View className="flex-1">
              <Text className={cn('text-lg font-extrabold', p.status === 'FAILED' ? 'text-foreground' : 'text-blush-foreground')}>{title}</Text>
              <Text className={cn('font-medium opacity-80', p.status === 'FAILED' ? 'text-foreground' : 'text-blush-foreground')}>{sub}</Text>
            </View>
            <Icon as={ChevronRight} size={22} className={p.status === 'FAILED' ? 'text-foreground' : 'text-blush-foreground'} />
          </Pressable>
        );
      })}
    </View>
  );
}
