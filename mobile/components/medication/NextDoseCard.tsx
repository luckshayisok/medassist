import { router } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useMedColor } from '@/lib/palette';
import { useDoseLogs } from '@/store/doseLogStore';
import type { DoseEvent } from '@/types/medication';
import { FOOD_TIMING_LABEL, foodLine, formatDose } from '@/utils/format';
import { MealIcon } from './MealIcon';
import { MedAvatar } from './MedAvatar';
import { StatusBadge } from './StatusBadge';
import { TimeChip } from './TimeChip';

function relative(dose: DoseEvent, now: Date): string {
  if (dose.status === 'DUE_NOW') return 'Take it now';
  if (dose.status === 'SNOOZED' && dose.log?.snoozedUntil) {
    const mins = Math.max(1, Math.round((Date.parse(dose.log.snoozedUntil) - now.getTime()) / 60_000));
    return `Again in ${mins} min`;
  }
  const mins = Math.round((dose.scheduledFor.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `In ${h} h ${m} min` : `In ${h} h`;
}

/** The single most important element on Home: what to take next. */
export function NextDoseCard({ dose, now }: { dose: DoseEvent; now: Date }) {
  const markTaken = useDoseLogs((s) => s.markTaken);
  const m = dose.medication;
  const color = useMedColor(m.name);
  const c = useThemeColors();
  const isDue = dose.status === 'DUE_NOW';
  const openReminder = () => router.push({ pathname: '/reminder/[doseKey]', params: { doseKey: dose.doseKey } });

  return (
    <View className="overflow-hidden rounded-[28px] border border-border bg-card">
      <Pressable onPress={openReminder} accessibilityRole="button" accessibilityHint="Shows full instructions" className="gap-4 p-5 active:bg-muted">
        <View className="flex-row items-center justify-between">
          <TimeChip time={dose.scheduledFor} />
          <View style={{ backgroundColor: isDue ? c.blush : color.bg }} className="rounded-full px-3 py-1">
            <Text style={{ color: isDue ? '#1F1D1B' : color.fg }} className="text-sm font-bold">
              {relative(dose, now)}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-4">
          <MedAvatar medication={m} size="lg" />
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold tracking-tight" numberOfLines={2}>
              {m.name}
            </Text>
            <Text className="text-base font-semibold text-muted-foreground">{m.dosage}</Text>
          </View>
          <Icon as={ChevronRight} size={24} className="text-muted-foreground" />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 gap-1 rounded-2xl bg-muted px-4 py-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dosage</Text>
            <Text className="text-lg font-extrabold">{formatDose(m)}</Text>
          </View>
          <View className="flex-1 gap-1 rounded-2xl bg-muted px-4 py-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meal</Text>
            <View className="flex-row items-center gap-2">
              <MealIcon timing={m.foodTiming} color={c.foreground} size={18} />
            </View>
            <Text className="text-sm font-semibold" numberOfLines={2}>
              {m.foodInstructions ?? FOOD_TIMING_LABEL[m.foodTiming]}
            </Text>
          </View>
        </View>

        {!isDue ? <StatusBadge status={dose.status} /> : null}
      </Pressable>

      {isDue ? (
        <View className="gap-2 px-5 pb-5">
          <Button
            testID="next-took-it"
            size="lg"
            className="min-h-16"
            accessibilityHint={`Records that you took ${m.name} now (${foodLine(m)})`}
            onPress={() => markTaken(dose)}
          >
            <Icon as={Check} size={26} className="text-primary-foreground" strokeWidth={3} />
            <Text className="text-lg">I took it</Text>
          </Button>
          <Button variant="ghost" onPress={openReminder}>
            <Text className="font-semibold text-foreground underline">Snooze, skip or details</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
