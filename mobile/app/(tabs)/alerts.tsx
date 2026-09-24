import { router } from 'expo-router';
import { BellRing, CheckCheck, ChevronRight, TriangleAlert } from 'lucide-react-native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCareAlerts, useMarkAlertsSeen } from '@/hooks/useCare';
import { cn } from '@/lib/utils';
import { toDateKey } from '@/utils/date';

function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 864e5));
  const key = toDateKey(d);
  return key === today ? `Today, ${time}` : key === yesterday ? `Yesterday, ${time}` : `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/** Caregivers: missed doses of the people they look after (last 7 days). */
export default function AlertsScreen() {
  const q = useCareAlerts();
  const seen = useMarkAlertsSeen();
  const alerts = q.data ?? [];
  const unseen = alerts.filter((a) => !a.seen);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-32 pt-2" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <Text role="heading" className="text-3xl font-extrabold tracking-tight">
          Alerts
        </Text>
        <Text className="-mt-2 text-muted-foreground">Doses that were not marked as taken within an hour.</Text>

        {unseen.length ? (
          <Button variant="outline" className="self-start border-2" disabled={seen.isPending} onPress={() => seen.mutate(unseen.map((a) => a.id))}>
            <Icon as={CheckCheck} size={20} />
            <Text>Mark all as checked</Text>
          </Button>
        ) : null}

        {q.isLoading ? (
          <ActivityIndicator size="large" className="mt-8" />
        ) : alerts.length === 0 ? (
          <View className="items-center gap-3 rounded-[28px] bg-success-soft p-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-card">
              <Icon as={BellRing} size={30} className="text-success" />
            </View>
            <Text className="text-center text-2xl font-extrabold">No missed doses</Text>
            <Text className="text-center font-medium">We'll tell you here, and on your phone, if a dose is missed.</Text>
          </View>
        ) : (
          alerts.map((a) => (
            <Pressable
              key={a.id}
              role="button"
              accessibilityLabel={`${a.patientName} may have missed ${a.medication}, ${when(a.scheduledFor)}${a.seen ? '' : '. New'}`}
              onPress={() => {
                if (!a.seen) seen.mutate([a.id]);
                router.push({ pathname: '/care/[patientId]', params: { patientId: a.patientId } });
              }}
              className={cn('flex-row items-center gap-3 rounded-[28px] p-4 active:opacity-80', a.seen ? 'border border-border bg-card' : 'border-2 border-destructive bg-destructive-soft')}
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-card">
                <Icon as={TriangleAlert} size={22} className={a.seen ? 'text-muted-foreground' : 'text-destructive'} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-extrabold">
                  {a.patientName} may have missed {a.medication}
                </Text>
                <Text className="font-medium text-muted-foreground">{when(a.scheduledFor)}</Text>
              </View>
              <Icon as={ChevronRight} size={22} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
