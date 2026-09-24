import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MedicationForm } from '@/components/medication/MedicationForm';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePrescriptionReview } from '@/store/prescriptionReviewStore';
import { validate, type FormErrors } from '@/utils/medicationForm';

/** Edit one medicine found on a scanned prescription. Saves back to the review (not the server). */
export default function EditDraft() {
  const { id, index } = useLocalSearchParams<{ id: string; index: string }>();
  const i = Number(index);
  const item = usePrescriptionReview((s) => s.byPrescription[id!]?.[i]);
  const setForm = usePrescriptionReview((s) => s.setForm);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [form, setLocal] = useState(item?.form);
  const [errors, setErrors] = useState<FormErrors>({});

  if (!item || !form) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text>This medicine is no longer in the review.</Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text>Go back</Text>
        </Button>
      </View>
    );
  }

  const save = () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setForm(id!, i, form);
    router.back();
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-2">
        <Pressable role="button" accessibilityLabel="Close without saving" onPress={() => router.back()} className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground">
          <Icon as={X} size={22} />
        </Pressable>
        <Text role="heading" className="text-lg font-bold">
          Check medicine
        </Text>
        <Pressable role="button" accessibilityLabel="Save" onPress={save} className="h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={24} strokeWidth={3} className="text-primary-foreground" />
        </Pressable>
      </View>
      <ScrollView ref={scrollRef} contentContainerClassName="gap-4 px-4 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        {item.attention.length ? (
          <View className="gap-2 rounded-3xl bg-warning-soft p-4">
            <Text className="font-extrabold text-warning">Please check</Text>
            {item.attention.map((a) => (
              <Text key={a.message} className="font-medium text-warning">
                • {a.message}
              </Text>
            ))}
          </View>
        ) : null}
        <MedicationForm value={form} onChange={setLocal} errors={errors} medId={item.draftId} />
      </ScrollView>
      <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button size="lg" onPress={save}>
          <Icon as={Check} size={24} strokeWidth={2.8} className="text-primary-foreground" />
          <Text>Done</Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
