import { CalendarDays } from 'lucide-react-native';
import { View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { DoseRow } from '@/components/medication/DoseRow';
import { EmptyMedicines } from '@/components/medication/EmptyMedicines';
import { groupByPeriod, PeriodHeader } from '@/components/medication/PeriodHeader';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTodayDoses } from '@/hooks/useTodayDoses';

export default function ScheduleScreen() {
  const { now, events, medications } = useTodayDoses();

  return (
    <Screen tab>
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
          <Icon as={CalendarDays} size={26} className="text-primary-foreground" />
        </View>
        <View className="flex-1">
          <Text role="heading" className="text-3xl font-extrabold tracking-tight">
            Today
          </Text>
          <Text className="text-muted-foreground">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
      </View>

      {medications.length === 0 ? <EmptyMedicines /> : null}
      {medications.length > 0 && events.length === 0 ? (
        <Text className="text-lg text-muted-foreground">No medicines are scheduled today.</Text>
      ) : null}

      {groupByPeriod(events).map(({ period, events: group }) => (
        <View key={period} className="gap-3">
          <PeriodHeader period={period} count={group.length} />
          {group.map((d) => (
            <DoseRow key={d.doseKey} dose={d} />
          ))}
        </View>
      ))}
    </Screen>
  );
}
