import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { PERIODS, usePeriodColor, type Period } from '@/lib/palette';
import type { DoseEvent } from '@/types/medication';

export function PeriodHeader({ period, count }: { period: Period; count?: number }) {
  const color = usePeriodColor(period);
  const { icon: Icon, label } = PERIODS[period];
  return (
    <View className="flex-row items-center gap-3 pt-2">
      <View style={{ backgroundColor: color.bg }} className="h-10 w-10 items-center justify-center rounded-xl">
        <Icon size={22} color={color.fg} strokeWidth={2.4} />
      </View>
      <Text role="heading" className="text-xl font-extrabold">
        {label}
      </Text>
      {count !== undefined ? <Text className="font-semibold text-muted-foreground">{count}</Text> : null}
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

/** Group dose events into morning/afternoon/evening/night, preserving order. */
export function groupByPeriod(events: DoseEvent[]) {
  const order: Period[] = ['morning', 'afternoon', 'evening', 'night'];
  const map = new Map<Period, DoseEvent[]>();
  for (const e of events) {
    const h = e.scheduledFor.getHours();
    const p: Period = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
    map.set(p, [...(map.get(p) ?? []), e]);
  }
  // Late-night doses (00:00–04:59) sort first by time but read naturally under "Night".
  return order.filter((p) => map.has(p)).map((p) => ({ period: p, events: map.get(p)! }));
}
