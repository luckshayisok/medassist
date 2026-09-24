import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Clock, Plus, SkipForward, TriangleAlert, UserMinus, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdherenceBars } from '@/components/adherence/AdherenceBars';
import { hhmm } from '@/components/care/CareHome';
import { FormAlert } from '@/components/common/FormAlert';
import { ProgressRing } from '@/components/common/ProgressRing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useCaredPerson, useLeavePatient } from '@/hooks/useCare';
import { cn } from '@/lib/utils';
import type { CaredPersonDetail } from '@/services/api/care';
import { dailyBars } from '@/utils/adherenceView';
import { FOOD_TIMING_LABEL } from '@/utils/format';

const OUTCOME: Record<CaredPersonDetail['today'][number]['outcome'], { label: string; icon: LucideIcon; box: string; iconClass: string }> = {
  TAKEN: { label: 'Taken', icon: CircleCheck, box: 'bg-success-soft', iconClass: 'text-success' },
  MISSED: { label: 'Missed', icon: TriangleAlert, box: 'bg-destructive-soft', iconClass: 'text-destructive' },
  SKIPPED: { label: 'Skipped', icon: SkipForward, box: 'bg-muted', iconClass: 'text-muted-foreground' },
  PENDING: { label: 'Coming up', icon: Clock, box: 'bg-secondary', iconClass: 'text-secondary-foreground' },
};

export default function CaredPersonScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const q = useCaredPerson(patientId);
  const leave = useLeavePatient();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string>();
  const p = q.data;
  const first = p?.name.split(' ')[0] ?? '';

  if (!p) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        {q.isError ? <Text className="text-center text-lg">You no longer have access to this person.</Text> : <ActivityIndicator size="large" />}
      </View>
    );
  }

  const todayTaken = p.today.filter((d) => d.outcome === 'TAKEN').length;
  const canManage = p.permissions.includes('manage_medications');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <Stack.Screen options={{ title: p.name }} />

      <View className="flex-row items-center gap-4 rounded-[28px] bg-secondary p-5">
        <ProgressRing size={92} stroke={11} progress={p.today.length ? todayTaken / p.today.length : 0} color={c.foreground} trackColor="rgba(31,29,27,0.14)" accessibilityLabel={`${todayTaken} of ${p.today.length} taken today`}>
          <Text className="text-xl font-extrabold text-secondary-foreground">{p.today.length ? `${todayTaken}/${p.today.length}` : '–'}</Text>
        </ProgressRing>
        <View className="flex-1">
          <Text className="text-2xl font-extrabold text-secondary-foreground">{p.name}</Text>
          <Text className="font-medium text-secondary-foreground">
            {p.today.length ? `${todayTaken} of ${p.today.length} taken today` : 'Nothing due today'}
          </Text>
          {p.week.percent !== null ? <Text className="font-medium text-secondary-foreground">{p.week.percent}% taken this week</Text> : null}
        </View>
      </View>

      <View className="gap-3">
        <Text role="heading" className="text-xl font-extrabold">
          Today
        </Text>
        {p.today.length === 0 ? <Text className="text-muted-foreground">No medicines are due today.</Text> : null}
        {p.today.map((d) => {
          const o = OUTCOME[d.outcome];
          return (
            <View key={`${d.medicationId}@${d.time}`} accessible accessibilityLabel={`${hhmm(d.time)}, ${d.medication}: ${o.label}${d.late ? ', late' : ''}`} className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4">
              <View className="w-20">
                <Text className="text-lg font-extrabold">{hhmm(d.time)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold" numberOfLines={1}>
                  {d.medication}
                </Text>
                <Text className="text-sm text-muted-foreground">{d.dosage}</Text>
              </View>
              <View className={cn('flex-row items-center gap-1.5 rounded-full px-3 py-1.5', o.box)}>
                <Icon as={o.icon} size={16} className={o.iconClass} />
                <Text className="text-sm font-bold">{d.late && d.outcome === 'TAKEN' ? 'Taken late' : o.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {p.week.percent !== null ? (
        <View className="gap-3 rounded-[28px] border border-border bg-card p-5">
          <Text role="heading" className="text-lg font-extrabold">
            This week
          </Text>
          <AdherenceBars bars={dailyBars(p.days)} />
        </View>
      ) : null}

      <View className="gap-3">
        <Text role="heading" className="text-xl font-extrabold">
          {first}'s medicines
        </Text>
        {p.medications.map((m) => (
          <View key={m.id} className="gap-1 rounded-3xl border border-border bg-card p-4">
            <Text className="text-lg font-bold">
              {m.name} <Text className="text-sm font-medium text-muted-foreground">{m.dosage}</Text>
            </Text>
            <Text className="text-muted-foreground">
              {m.doseQuantity} {m.unit}
              {m.doseQuantity === 1 ? '' : 's'} at {m.times.map(hhmm).join(', ')} · {FOOD_TIMING_LABEL[m.foodTiming]}
            </Text>
          </View>
        ))}
        {p.medications.length === 0 ? <Text className="text-muted-foreground">No medicines added yet.</Text> : null}
        {canManage ? (
          <Button variant="outline" className="border-2" onPress={() => router.push({ pathname: '/medication/new', params: { patientId: p.id } })}>
            <Icon as={Plus} size={20} />
            <Text>Add a medicine for {first}</Text>
          </Button>
        ) : null}
      </View>

      <FormAlert message={error} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost">
            <Icon as={UserMinus} size={20} className="text-destructive" />
            <Text className="text-destructive">Stop helping {first}</Text>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop helping {first}?</AlertDialogTitle>
            <AlertDialogDescription>You will no longer see their medicines or get alerts. They can give you a new code later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Keep helping</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={async () => {
                try {
                  await leave.mutateAsync(p.id);
                  router.back();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Please try again.');
                }
              }}
            >
              <Text className="text-destructive-foreground">Stop helping</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollView>
  );
}
