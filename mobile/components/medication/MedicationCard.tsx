import { router } from 'expo-router';
import { ChevronRight, Utensils } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Medication } from '@/types/medication';
import { describeFrequency, foodLine, formatDose } from '@/utils/format';
import { MedAvatar } from './MedAvatar';
import { TimeChip } from './TimeChip';

export function MedicationCard({ medication: m }: { medication: Medication }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${m.name} ${m.dosage}. ${formatDose(m)}. ${describeFrequency(m.schedules[0])}.`}
      accessibilityHint="Opens this medicine"
      onPress={() => router.push({ pathname: '/medication/[id]', params: { id: m.id } })}
      className="gap-4 rounded-[28px] border border-border bg-card p-4 shadow-sm shadow-black/5 active:bg-accent"
    >
      <View className="flex-row items-center gap-4">
        <MedAvatar medication={m} size="md" />
        <View className="flex-1 gap-0.5">
          <Text className="text-xl font-extrabold" numberOfLines={2}>
            {m.name}
          </Text>
          <Text className="font-medium text-muted-foreground">
            {m.dosage} · {formatDose(m)}
          </Text>
        </View>
        <Icon as={ChevronRight} size={26} className="text-muted-foreground" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {m.schedules.map((s) => (
          <TimeChip key={s.id} time={s.time} />
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Icon as={Utensils} size={18} className="text-muted-foreground" />
        <Text className="flex-1 text-muted-foreground" numberOfLines={1}>
          {describeFrequency(m.schedules[0])} · {foodLine(m)}
        </Text>
      </View>
    </Pressable>
  );
}
