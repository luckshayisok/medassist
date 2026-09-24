import { router, useLocalSearchParams } from 'expo-router';
import {
  CalendarRange,
  ClipboardList,
  GlassWater,
  NotebookPen,
  Pencil,
  ShieldAlert,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Utensils,
} from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FormAlert } from '@/components/common/FormAlert';
import { Screen } from '@/components/common/Screen';
import { MedAvatar } from '@/components/medication/MedAvatar';
import { TimeChip } from '@/components/medication/TimeChip';
import { InfoBlock } from '@/components/reminder/InfoBlock';
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
import { useDeleteMedication, useMedication } from '@/hooks/useMedications';
import { useMedColor } from '@/lib/palette';
import { describeCourse, describeFrequency, FOOD_TIMING_LABEL, formatDose } from '@/utils/format';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useMedication(id);
  const del = useDeleteMedication();
  const [error, setError] = useState<string>();
  const color = useMedColor(m?.name ?? '');

  if (!m) {
    return (
      <Screen edges={['left', 'right']}>
        <Text className="text-lg">This medicine could not be found. It may have been deleted.</Text>
        <Button onPress={() => router.back()}>
          <Text>Go back</Text>
        </Button>
      </Screen>
    );
  }

  const remove = async () => {
    try {
      await del.mutateAsync(m.id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete. Please try again.');
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-10">
      <View style={{ backgroundColor: color.bg }} className="items-center gap-3 rounded-b-[36px] px-5 pb-7 pt-5">
        <MedAvatar medication={m} size="xl" />
        <Text role="heading" className="text-center text-3xl font-extrabold tracking-tight" style={{ color: color.fg }}>
          {m.name}
        </Text>
        <Text className="text-xl font-bold" style={{ color: color.fg }}>
          {m.dosage}
        </Text>
      </View>

      <View className="gap-3 px-4 pt-5">
        <FormAlert message={error} />

        <View className="flex-row gap-3">
          <Button className="flex-1 rounded-2xl" onPress={() => router.push({ pathname: '/medication/[id]/edit', params: { id: m.id } })}>
            <Icon as={Pencil} size={22} />
            <Text>Edit</Text>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="flex-1 rounded-2xl border-2 border-destructive">
                <Icon as={Trash2} size={22} className="text-destructive" />
                <Text className="text-destructive">Delete</Text>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {m.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will stop getting reminders for this medicine. Your past history is kept. Only delete it if your doctor stopped this medicine.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Text>Keep it</Text>
                </AlertDialogCancel>
                <AlertDialogAction className="bg-destructive" onPress={remove}>
                  <Text className="text-destructive-foreground">Delete</Text>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </View>

        <InfoBlock icon={ClipboardList} title="Take">
          <Text className="text-2xl font-extrabold">{formatDose(m)}</Text>
          <Text className="text-muted-foreground">{describeFrequency(m.schedules[0])}</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {m.schedules.map((s) => (
              <TimeChip key={s.id} time={s.time} />
            ))}
          </View>
        </InfoBlock>
        <InfoBlock icon={CalendarRange} title="Course">
          <Text className="font-semibold">{describeCourse(m)}</Text>
        </InfoBlock>
        {m.instructions ? (
          <InfoBlock icon={GlassWater} title="How to take it">
            <Text>{m.instructions}</Text>
          </InfoBlock>
        ) : null}
        <InfoBlock icon={Utensils} title="Food">
          <Text className="font-semibold">{FOOD_TIMING_LABEL[m.foodTiming]}</Text>
          {m.foodInstructions ? <Text>{m.foodInstructions}</Text> : null}
        </InfoBlock>
        {m.avoid.length ? (
          <InfoBlock icon={TriangleAlert} title="Avoid" tone="warning">
            {m.avoid.map((a) => (
              <View key={a.text}>
                <Text>{a.text}</Text>
                <Text className="text-sm text-muted-foreground">
                  {a.source.kind === 'verified' ? `Source: ${a.source.source}` : 'From your prescription or doctor'}
                </Text>
              </View>
            ))}
          </InfoBlock>
        ) : null}
        {m.precautions ? (
          <InfoBlock icon={ShieldAlert} title="Important" tone="warning">
            <Text>{m.precautions}</Text>
          </InfoBlock>
        ) : null}
        {m.prescriber ? (
          <InfoBlock icon={Stethoscope} title="Prescribed by">
            <Text className="font-semibold">{m.prescriber}</Text>
          </InfoBlock>
        ) : null}
        {m.notes ? (
          <InfoBlock icon={NotebookPen} title="Notes">
            <Text>{m.notes}</Text>
          </InfoBlock>
        ) : null}
      </View>
    </ScrollView>
  );
}
