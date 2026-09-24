import { router } from 'expo-router';
import { Bell, ChevronRight, CircleCheck, Clock, HeartHandshake, Link2, TriangleAlert, UserPlus } from 'lucide-react-native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '@/components/common/HomeHeader';
import { ProgressRing } from '@/components/common/ProgressRing';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useCareAlerts, useCaredPeople } from '@/hooks/useCare';
import type { CaredPerson } from '@/services/api/care';
import { useAuth } from '@/store/authStore';
import { atLocalTime, formatTime } from '@/utils/date';

export const hhmm = (t: string) => formatTime(atLocalTime(new Date(), t));

/** Caregiver home: everyone they look after, and how today is going for each. */
export function CareHome() {
  const name = useAuth((s) => s.user?.name) ?? '';
  const people = useCaredPeople();
  const alerts = useCareAlerts();
  const unseen = (alerts.data ?? []).filter((a) => !a.seen).length;
  const now = new Date();
  const list = people.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-32 pt-2"
        refreshControl={<RefreshControl refreshing={people.isRefetching} onRefresh={() => void Promise.all([people.refetch(), alerts.refetch()])} />}
      >
        <HomeHeader
          name={name}
          now={now}
          action={{ icon: Bell, label: unseen ? `${unseen} new alerts` : 'Alerts', badge: unseen, onPress: () => router.navigate('/alerts') }}
        />
        <Text className="-mt-2 font-medium text-muted-foreground">Here's how the people you look after are doing today.</Text>

        {unseen ? (
          <Pressable
            role="button"
            onPress={() => router.navigate('/alerts')}
            className="flex-row items-center gap-3 rounded-[28px] border-2 border-destructive bg-destructive-soft p-4 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-card">
              <Icon as={TriangleAlert} size={22} className="text-destructive" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-extrabold">{unseen === 1 ? '1 missed dose' : `${unseen} missed doses`}</Text>
              <Text className="font-medium">Tap to see who and when</Text>
            </View>
            <Icon as={ChevronRight} size={22} />
          </Pressable>
        ) : null}

        {people.isLoading ? (
          <ActivityIndicator size="large" className="mt-8" accessibilityLabel="Loading" />
        ) : list.length === 0 ? (
          <EmptyCare />
        ) : (
          <View className="gap-3">
            {list.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
            <Button variant="outline" className="mt-1 border-2" onPress={() => router.push('/care/link')}>
              <Icon as={UserPlus} size={20} />
              <Text>Link another person</Text>
            </Button>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonCard({ person: p }: { person: CaredPerson }) {
  const c = useThemeColors();
  const t = p.today;
  const due = t.scheduled;
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${p.name}. ${t.taken} of ${due} doses taken today${t.missed ? `, ${t.missed} missed` : ''}.`}
      onPress={() => router.push({ pathname: '/care/[patientId]', params: { patientId: p.id } })}
      className="gap-4 rounded-[28px] border border-border bg-card p-4 active:bg-accent"
    >
      <View className="flex-row items-center gap-4">
        <ProgressRing size={72} stroke={9} progress={due ? t.taken / due : 0} color={c.foreground} trackColor="rgba(31,29,27,0.12)" accessibilityLabel={`${t.taken} of ${due} taken today`}>
          <Text className="text-base font-extrabold">{due ? `${t.taken}/${due}` : '–'}</Text>
        </ProgressRing>
        <View className="flex-1 gap-0.5">
          <Text className="text-xl font-extrabold" numberOfLines={1}>
            {p.name}
          </Text>
          <Text className="font-medium text-muted-foreground">
            {due ? `${t.taken} of ${due} taken today` : 'Nothing due today'}
            {p.week.percent !== null ? ` · ${p.week.percent}% this week` : ''}
          </Text>
        </View>
        <Icon as={ChevronRight} size={22} />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {t.missed ? (
          <Pill tone="bg-destructive-soft" icon={TriangleAlert} iconClass="text-destructive" label={`${t.missed} missed`} />
        ) : due && t.pending === 0 ? (
          <Pill tone="bg-success-soft" icon={CircleCheck} iconClass="text-success" label="All done today" />
        ) : null}
        {t.next ? <Pill tone="bg-secondary" icon={Clock} iconClass="text-secondary-foreground" label={`Next: ${t.next.medication} at ${hhmm(t.next.time)}`} /> : null}
      </View>
    </Pressable>
  );
}

function Pill({ tone, icon, iconClass, label }: { tone: string; icon: typeof Clock; iconClass: string; label: string }) {
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${tone}`}>
      <Icon as={icon} size={16} className={iconClass} />
      <Text className="text-sm font-bold">{label}</Text>
    </View>
  );
}

function EmptyCare() {
  return (
    <View className="gap-4">
      <View className="overflow-hidden rounded-[28px] bg-secondary p-6">
        <Text importantForAccessibility="no" style={{ position: 'absolute', right: 18, top: 6, fontSize: 64, opacity: 0.18 }}>
          ✚
        </Text>
        <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-primary">
          <Icon as={HeartHandshake} size={28} className="text-primary-foreground" />
        </View>
        <Text className="text-2xl font-extrabold text-secondary-foreground">Link with someone you care for</Text>
        <Text className="mb-4 mt-1 font-medium text-secondary-foreground">
          Ask them to open MedAssist → Profile → Family & caregivers → “Create a code”, and tell you the code.
        </Text>
        <Button className="self-start px-6" onPress={() => router.push('/care/link')}>
          <Icon as={Link2} size={20} className="text-primary-foreground" />
          <Text>Enter their code</Text>
        </Button>
      </View>
      <Text className="px-1 text-muted-foreground">
        You'll see their medicines and whether they took them. If they allow it, you'll also get a message when a dose is missed.
      </Text>
    </View>
  );
}
