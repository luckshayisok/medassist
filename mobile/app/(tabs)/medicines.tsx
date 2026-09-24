import { router } from 'expo-router';
import { CloudOff, HeartHandshake, Plus } from 'lucide-react-native';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyMedicines } from '@/components/medication/EmptyMedicines';
import { MedicationCard } from '@/components/medication/MedicationCard';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMedicationsQuery } from '@/hooks/useMedications';
import { useAuth } from '@/store/authStore';

export default function MedicinesScreen() {
  const role = useAuth((s) => s.user?.role);
  const query = useMedicationsQuery();
  const meds = query.data ?? [];

  if (role === 'CAREGIVER') {
    return (
      <SafeAreaView className="flex-1 bg-background p-4" edges={['top', 'left', 'right']}>
        <View className="items-center gap-3 rounded-[28px] bg-card p-6">
          <Icon as={HeartHandshake} size={40} className="text-primary" />
          <Text className="text-center text-2xl font-extrabold">Caring for someone?</Text>
          <Text className="text-center text-muted-foreground">
            Soon you'll be able to link to the person you care for and manage their medicines here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-32 pt-4"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      >
        <View className="flex-row items-end justify-between">
          <View>
            <Text role="heading" className="text-3xl font-extrabold tracking-tight">
              My medicines
            </Text>
            <Text className="text-muted-foreground">
              {meds.length === 0 ? 'Nothing added yet' : `${meds.length} ${meds.length === 1 ? 'medicine' : 'medicines'}`}
            </Text>
          </View>
        </View>

        {meds.length > 0 ? (
          <Button size="lg" className="rounded-2xl" onPress={() => router.push('/add')}>
            <Icon as={Plus} size={26} strokeWidth={2.6} />
            <Text>Add medicine</Text>
          </Button>
        ) : null}

        {query.isError && meds.length > 0 ? (
          <View className="flex-row items-center gap-3 rounded-2xl bg-warning-soft p-4">
            <Icon as={CloudOff} size={22} className="text-warning" />
            <Text className="flex-1 font-semibold text-warning">You're offline. Showing your saved list.</Text>
          </View>
        ) : null}

        {query.isLoading && meds.length === 0 ? (
          <ActivityIndicator size="large" className="mt-10" accessibilityLabel="Loading your medicines" />
        ) : meds.length === 0 ? (
          <EmptyMedicines />
        ) : (
          meds.map((m) => <MedicationCard key={m.id} medication={m} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
