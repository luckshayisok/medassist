import { AlarmClock, BellRing, CircleCheck, Clock, SkipForward, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { DoseStatus } from '@/types/medication';

export const STATUS_META: Record<DoseStatus, { label: string; icon: LucideIcon; box: string; fg: string }> = {
  TAKEN: { label: 'Taken', icon: CircleCheck, box: 'bg-success-soft', fg: 'text-success' },
  DUE_NOW: { label: 'Due now', icon: BellRing, box: 'bg-primary', fg: 'text-primary-foreground' },
  UPCOMING: { label: 'Upcoming', icon: Clock, box: 'bg-muted', fg: 'text-muted-foreground' },
  SNOOZED: { label: 'Snoozed', icon: AlarmClock, box: 'bg-warning-soft', fg: 'text-warning' },
  SKIPPED: { label: 'Skipped', icon: SkipForward, box: 'bg-muted', fg: 'text-muted-foreground' },
  MISSED: { label: 'Missed', icon: TriangleAlert, box: 'bg-destructive-soft', fg: 'text-destructive' },
};

/** Status is always icon + word, never color alone. */
export function StatusBadge({ status, size = 'md', className }: { status: DoseStatus; size?: 'sm' | 'md'; className?: string }) {
  const m = STATUS_META[status];
  const sm = size === 'sm';
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${m.label}`}
      className={cn('flex-row items-center self-start rounded-full', sm ? 'gap-1 px-2.5 py-0.5' : 'gap-1.5 px-3 py-1', m.box, className)}
    >
      <Icon as={m.icon} size={sm ? 15 : 18} className={m.fg} />
      <Text className={cn('font-bold', sm ? 'text-sm' : 'text-base', m.fg)}>{m.label}</Text>
    </View>
  );
}
