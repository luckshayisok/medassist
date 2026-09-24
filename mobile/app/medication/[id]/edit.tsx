import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/common/Screen';
import { MedicationEditor } from '@/components/medication/MedicationEditor';
import { Text } from '@/components/ui/text';
import { useMedication } from '@/hooks/useMedications';

export default function EditMedicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const med = useMedication(id);
  if (!med) {
    return (
      <Screen edges={['left', 'right']}>
        <Text className="text-lg">This medicine could not be found.</Text>
      </Screen>
    );
  }
  // key: reset the form if the medicine changes underneath (e.g. after a refresh).
  return <MedicationEditor key={`${med.id}-${med.version}`} existing={med} />;
}
