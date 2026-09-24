import { router } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSaveMedication } from '@/hooks/useMedications';
import { ApiError } from '@/services/api/client';
import type { Medication } from '@/types/medication';
import { uuid } from '@/utils/id';
import { emptyForm, fromMedication, mapServerFields, toPayload, validate, type FormErrors } from '@/utils/medicationForm';
import { MedicationForm } from './MedicationForm';

/** Shared add/edit screen: ✕ / title / ✓ header, the form, and a big Save bar. */
export function MedicationEditor({ existing }: { existing?: Medication }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [form, setForm] = useState(() => (existing ? fromMedication(existing) : emptyForm()));
  const [errors, setErrors] = useState<FormErrors>({});
  const save = useSaveMedication();
  const medId = useMemo(() => existing?.id ?? uuid(), [existing?.id]);

  // Clear a field's error as soon as the user changes that field.
  const onChange = (next: typeof form) => {
    setForm(next);
    setErrors((prev) => {
      const changed = (Object.keys(prev) as (keyof typeof form)[]).filter((k) => k in next && next[k] !== form[k]);
      if (!changed.length) return prev;
      const rest = { ...prev };
      for (const k of changed) delete rest[k];
      if (Object.keys(rest).length === 1 && rest.form) return {};
      return rest;
    });
  };

  const onSave = async () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    try {
      const med = await save.mutateAsync({ id: existing?.id, version: existing?.version, input: toPayload(form), photo: form.photo });
      if (existing) router.back();
      else router.replace({ pathname: '/medication/[id]', params: { id: med.id } });
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = mapServerFields(err.fields);
        setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: err.message });
      } else {
        setErrors({ form: err instanceof Error ? err.message : 'Could not save. Please try again.' });
      }
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-2">
        <Pressable
          role="button"
          accessibilityLabel="Close without saving"
          onPress={() => router.back()}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground"
        >
          <Icon as={X} size={22} />
        </Pressable>
        <Text role="heading" className="text-lg font-bold">
          {existing ? 'Edit medicine' : 'Add medicine'}
        </Text>
        <Pressable
          role="button"
          accessibilityLabel="Save medicine"
          disabled={save.isPending}
          onPress={onSave}
          className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Icon as={Check} size={24} strokeWidth={3} className="text-primary-foreground" />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} contentContainerClassName="gap-4 px-4 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        <MedicationForm value={form} onChange={onChange} errors={errors} medId={medId} />
      </ScrollView>

      <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button size="lg" disabled={save.isPending} onPress={onSave}>
          <Icon as={Check} size={24} strokeWidth={2.8} className="text-primary-foreground" />
          <Text>{save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save medicine'}</Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
