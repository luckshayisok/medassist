import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { periodOf, PERIODS, usePeriodColor } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { atLocalTime, formatTime } from '@/utils/date';

/** A time with its time-of-day icon and colour, e.g. ☀ 1:00 PM. */
export function TimeChip({ time, size = 'md' }: { time: string | Date; size?: 'md' | 'lg' }) {
  const p = periodOf(time);
  const color = usePeriodColor(p);
  const Icon = PERIODS[p].icon;
  const label = formatTime(typeof time === 'string' ? atLocalTime(new Date(), time) : time);
  const lg = size === 'lg';
  return (
    <View
      accessible
      accessibilityLabel={`${PERIODS[p].label}, ${label}`}
      style={{ backgroundColor: color.bg }}
      className={cn('flex-row items-center self-start rounded-full', lg ? 'gap-2 px-4 py-2' : 'gap-1.5 px-3 py-1')}
    >
      <Icon size={lg ? 22 : 17} color={color.fg} strokeWidth={2.4} />
      <Text style={{ color: color.fg }} className={cn('font-bold', lg ? 'text-lg' : 'text-base')}>
        {label}
      </Text>
    </View>
  );
}
