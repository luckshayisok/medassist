import { router } from 'expo-router';
import { Bell, BellOff, CalendarDays, ChartColumn, Moon, PartyPopper } from 'lucide-react-native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressRing } from '@/components/common/ProgressRing';
import { DoseRow } from '@/components/medication/DoseRow';
import { EmptyMedicines } from '@/components/medication/EmptyMedicines';
import { NextDoseCard } from '@/components/medication/NextDoseCard';
import { groupByPeriod, PeriodHeader } from '@/components/medication/PeriodHeader';
import { RemindersOffBanner } from '@/components/reminder/RemindersCard';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useMedicationsQuery } from '@/hooks/useMedications';
import { useReminderState } from '@/hooks/useReminders';
import { useTodayDoses } from '@/hooks/useTodayDoses';
import { useAuth } from '@/store/authStore';
import { greeting } from '@/utils/date';

export default function HomeScreen() {
  const { now, events, next, summary, medications } = useTodayDoses();
  const query = useMedicationsQuery();
  const name = useAuth((s) => s.user?.name) ?? '';
  const firstName = name.split(' ')[0];
  const remindersOn = useReminderState((s) => s.permission === 'granted' || s.permission === 'unsupported');
  const c = useThemeColors();
  const total = summary.totalScheduled;
  const left = events.filter((e) => e.status === 'UPCOMING' || e.status === 'DUE_NOW' || e.status === 'SNOOZED').length;
  const missed = events.filter((e) => e.status === 'MISSED').length;
  const allTaken = total > 0 && summary.taken === total;
  const loadingFirstTime = query.isLoading && medications.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-32 pt-2"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      >
        {/* Top bar: avatar · date · reminder status */}
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.navigate('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground"
          >
            <Text className="text-lg font-extrabold">{firstName.slice(0, 1).toUpperCase() || '🙂'}</Text>
          </Pressable>
          <Text className="font-semibold text-muted-foreground">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </Text>
          <Pressable
            onPress={() => router.navigate('/profile')}
            accessibilityRole="button"
            accessibilityLabel={remindersOn ? 'Reminders are on' : 'Reminders are off. Open settings'}
            className="h-12 w-12 items-center justify-center rounded-full bg-card"
          >
            <Icon as={remindersOn ? Bell : BellOff} size={22} className={remindersOn ? 'text-foreground' : 'text-warning'} />
          </Pressable>
        </View>

        <Text role="heading" className="text-3xl font-extrabold tracking-tight">
          {greeting(now)}
          {firstName ? `,\n${firstName}` : ''}
        </Text>

        {total > 0 ? (
          <View className="flex-row items-center gap-4 rounded-[28px] bg-secondary p-5">
            <ProgressRing
              size={84}
              stroke={10}
              progress={summary.taken / total}
              color={c.foreground}
              trackColor="rgba(31,29,27,0.14)"
              accessibilityLabel={`${summary.taken} of ${total} medicines taken today`}
            >
              <Text className="text-xl font-extrabold text-secondary-foreground">
                {summary.taken}/{total}
              </Text>
            </ProgressRing>
            <View className="flex-1 gap-2">
              <View>
                <Text className="text-xl font-extrabold text-secondary-foreground">
                  {left > 0 ? `${left} ${left === 1 ? 'dose' : 'doses'} left` : allTaken ? 'All done today!' : 'No more doses today'}
                </Text>
                <Text className="font-medium text-secondary-foreground">
                  {summary.taken} of {total} taken today
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" className="px-4" onPress={() => router.navigate('/schedule')}>
                  <Icon as={CalendarDays} size={18} className="text-primary-foreground" />
                  <Text className="text-sm">Today</Text>
                </Button>
                <Button size="sm" variant="outline" className="border-2 border-foreground bg-transparent px-4" onPress={() => router.push('/history')}>
                  <Icon as={ChartColumn} size={18} />
                  <Text className="text-sm">History</Text>
                </Button>
              </View>
            </View>
          </View>
        ) : null}

        {medications.length > 0 ? <RemindersOffBanner /> : null}

        {loadingFirstTime ? (
          <View className="items-center rounded-[28px] bg-card p-10">
            <ActivityIndicator size="large" accessibilityLabel="Loading your medicines" />
          </View>
        ) : medications.length === 0 ? (
          <EmptyMedicines />
        ) : next ? (
          <View className="gap-3">
            <Text role="heading" className="text-xl font-extrabold">
              Next medicine
            </Text>
            <NextDoseCard dose={next} now={now} />
          </View>
        ) : (
          <View className="items-center gap-2 rounded-[28px] bg-accent p-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-card">
              <Icon as={allTaken ? PartyPopper : Moon} size={32} className="text-foreground" />
            </View>
            <Text className="text-2xl font-extrabold">{allTaken ? 'All done for today' : 'Nothing more due today'}</Text>
            <Text className="text-center text-muted-foreground">
              {allTaken
                ? 'You took every dose today. Well done!'
                : missed > 0
                  ? `${missed} ${missed === 1 ? 'dose was' : 'doses were'} missed. Don't take extra to catch up — ask your doctor or pharmacist if unsure.`
                  : events.length
                    ? 'No more medicines are due today.'
                    : 'No medicines are scheduled today.'}
            </Text>
          </View>
        )}

        {events.length > 0 ? (
          <View className="gap-3">
            <Text role="heading" className="mt-1 text-xl font-extrabold">
              Today's plan
            </Text>
            {groupByPeriod(events).map(({ period, events: group }) => (
              <View key={period} className="gap-3">
                <PeriodHeader period={period} />
                {group.map((e) => (
                  <DoseRow key={e.doseKey} dose={e} />
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
