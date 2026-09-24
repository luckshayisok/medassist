import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { DoseEvent } from '@/types/medication';
import { formatTime } from '@/utils/date';
import { formatDose } from '@/utils/format';
import { MedAvatar } from './MedAvatar';
import { STATUS_META, StatusBadge } from './StatusBadge';

export function DoseRow({ dose, showTime = true }: { dose: DoseEvent; showTime?: boolean }) {
  const time = formatTime(dose.scheduledFor);
  const m = dose.medication;
  const done = dose.status === 'TAKEN' || dose.status === 'SKIPPED';

  return (
    <Pressable
      role="button"
      accessibilityLabel={`${time}, ${m.name} ${m.dosage}, ${formatDose(m)}. ${STATUS_META[dose.status].label}.`}
      accessibilityHint="Opens details for this dose"
      onPress={() => router.push({ pathname: '/reminder/[doseKey]', params: { doseKey: dose.doseKey } })}
      className={cn(
        'min-h-16 flex-row items-center gap-4 rounded-3xl border border-border bg-card p-3 pr-4 shadow-sm shadow-black/5 active:bg-accent',
        done && 'opacity-80',
      )}
    >
      <MedAvatar medication={m} size="sm" />
      <View className="flex-1 gap-1">
        <Text className="text-lg font-bold" numberOfLines={2}>
          {m.name} <Text className="text-base font-medium text-muted-foreground">{m.dosage}</Text>
        </Text>
        <Text className="text-muted-foreground">
          {showTime ? `${time} · ` : ''}
          {formatDose(m)}
        </Text>
        <StatusBadge status={dose.status} size="sm" />
      </View>
      <Icon as={ChevronRight} size={24} className="text-muted-foreground" />
    </Pressable>
  );
}
