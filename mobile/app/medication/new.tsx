import { useLocalSearchParams } from 'expo-router';
import { MedicationEditor } from '@/components/medication/MedicationEditor';

export default function NewMedicationScreen() {
  // A caregiver adding a medicine for someone passes ?patientId=.
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  return <MedicationEditor patientId={patientId} />;
}
