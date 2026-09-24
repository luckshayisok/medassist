import { AlarmClock, CircleCheck, CloudOff, Flame, Lightbulb, PartyPopper, Pill, SkipForward, Sprout, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdherenceBars } from '@/components/adherence/AdherenceBars';
import { Chip } from '@/components/common/Chip';
import { ProgressRing } from '@/components/common/ProgressRing';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useAdherence, type AdherenceRange } from '@/hooks/useAdherence';
import { dailyBars, weeklyBars } from '@/utils/adherenceView';

const INSIGHT_ICON: Record<string, LucideIcon> = {
  praise: PartyPopper,
  streak: Flame,
  pattern: TriangleAlert,
  medicine: Pill,
  late: AlarmClock,
  refill: Pill,
  summary: Lightbulb,
};

export default function HistoryScreen() {
  const [range, setRange] = useState<AdherenceRange>('weekly');
  const q = useAdherence(range);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const r = q.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <View className="flex-row gap-2" role="radiogroup" accessibilityLabel="Time range">
        <Chip label="This week" selected={range === 'weekly'} onPress={() => setRange('weekly')} className="flex-1" />
        <Chip label="Last 30 days" selected={range === 'monthly'} onPress={() => setRange('monthly')} className="flex-1" />
      </View>

      {q.isLoading && !r ? (
        <ActivityIndicator size="large" className="mt-10" accessibilityLabel="Loading your history" />
      ) : !r ? (
        <View className="items-center gap-3 rounded-[28px] bg-card p-6">
          <Icon as={CloudOff} size={32} className="text-muted-foreground" />
          <Text className="text-center font-semibold">Connect to the internet to see your history.</Text>
        </View>
      ) : r.totals.percent === null ? (
        // Nothing has been due yet (e.g. medicines added today): explain instead of showing empty charts.
        <View className="items-center gap-3 overflow-hidden rounded-[28px] bg-secondary p-6">
          <Text importantForAccessibility="no" style={{ position: 'absolute', right: 16, top: -2, fontSize: 60, opacity: 0.16 }}>
            ✚
          </Text>
          <View className="h-16 w-16 items-center justify-center rounded-full bg-card">
            <Icon as={Sprout} size={32} className="text-foreground" />
          </View>
          <Text className="text-center text-2xl font-extrabold text-secondary-foreground">Your progress starts here</Text>
          <Text className="text-center font-medium text-secondary-foreground">
            Nothing was due {range === 'weekly' ? 'this week' : 'in the last 30 days'} yet. Each time you tap “I took it”, it will show up here, day by day.
          </Text>
        </View>
      ) : (
        <>
          {/* Headline: one number + the counts behind it (icon + word, never colour alone) */}
          <View className="gap-4 rounded-[28px] bg-secondary p-5">
            <View className="flex-row items-center gap-4">
              <ProgressRing
                size={96}
                stroke={11}
                progress={(r.totals.percent ?? 0) / 100}
                color={c.foreground}
                trackColor="rgba(31,29,27,0.14)"
                accessibilityLabel={r.totals.percent === null ? 'Nothing due yet' : `${r.totals.percent} percent of doses taken`}
              >
                <Text className="text-2xl font-extrabold text-secondary-foreground">{r.totals.percent === null ? '–' : `${r.totals.percent}%`}</Text>
              </ProgressRing>
              <View className="flex-1">
                <Text className="text-xl font-extrabold text-secondary-foreground">Doses taken</Text>
                <Text className="font-medium text-secondary-foreground">
                  {r.totals.taken} of {r.totals.taken + r.totals.skipped + r.totals.missed} due {range === 'weekly' ? 'this week' : 'in 30 days'}
                </Text>
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <CountPill icon={CircleCheck} label="Taken" value={r.totals.taken} />
              <CountPill icon={TriangleAlert} label="Missed" value={r.totals.missed} />
              <CountPill icon={SkipForward} label="Skipped" value={r.totals.skipped} />
              <CountPill icon={AlarmClock} label="Late" value={r.totals.late} />
            </View>
          </View>

          <View className="gap-3 rounded-[28px] border border-border bg-card p-5">
            <Text role="heading" className="text-lg font-extrabold">
              {range === 'weekly' ? 'Each day' : 'Each week'}
            </Text>
            <AdherenceBars key={range} bars={range === 'weekly' ? dailyBars(r.days) : weeklyBars(r.days)} />
          </View>

          {r.insights.length ? (
            <View className="gap-3">
              <Text role="heading" className="text-xl font-extrabold">
                What we noticed
              </Text>
              {r.insights.map((i) => (
                <View key={i.text} className="flex-row items-center gap-3 rounded-3xl bg-accent p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-card">
                    <Icon as={INSIGHT_ICON[i.kind] ?? Lightbulb} size={20} className="text-foreground" />
                  </View>
                  <Text className="flex-1 font-semibold">{i.text}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {r.medications.length ? (
            <View className="gap-3">
              <Text role="heading" className="text-xl font-extrabold">
                By medicine
              </Text>
              {r.medications.map((m) => (
                <View
                  key={m.id}
                  accessible
                  accessibilityLabel={`${m.name}: ${m.percent === null ? 'nothing due yet' : `${m.percent} percent taken, ${m.taken} of ${m.taken + m.skipped + m.missed}`}`}
                  className="gap-2 rounded-3xl border border-border bg-card p-4"
                >
                  <View className="flex-row items-baseline justify-between gap-2">
                    <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
                      {m.name} <Text className="text-sm font-medium text-muted-foreground">{m.dosage}</Text>
                    </Text>
                    <Text className="text-lg font-extrabold">{m.percent === null ? '–' : `${m.percent}%`}</Text>
                  </View>
                  <View className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <View style={{ width: `${m.percent ?? 0}%`, backgroundColor: c.foreground }} className="h-full rounded-full" />
                  </View>
                  <Text className="text-sm text-muted-foreground">
                    {m.taken} taken · {m.missed} missed · {m.skipped} skipped{m.deleted ? ' · no longer in your list' : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text className="text-sm text-muted-foreground">
            This shows what was recorded in MedAssist. It is not medical advice. If you often miss doses, or are unsure what to do after a missed dose, talk to your doctor or pharmacist.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function CountPill({ icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-card px-3 py-1.5" accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon as={icon} size={16} className="text-foreground" />
      <Text className="text-sm font-bold">
        {value} {label.toLowerCase()}
      </Text>
    </View>
  );
}
