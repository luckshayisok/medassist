import { ChevronDown, ChevronUp, Minus, Plus, Stethoscope, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Checkbox } from '@/components/common/Checkbox';
import { Chip } from '@/components/common/Chip';
import { FormAlert } from '@/components/common/FormAlert';
import { FormField } from '@/components/common/FormField';
import { FieldError, FormSection } from '@/components/common/FormSection';
import { SelectPill } from '@/components/common/SelectPill';
import { Stepper } from '@/components/common/Stepper';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { cn } from '@/lib/utils';
import { DOSE_UNITS, type FoodTiming } from '@/types/medication';
import { addDays, atLocalTime, formatTime, fromDateKey, toDateKey } from '@/utils/date';
import { formatQuantity, UNIT_LABEL } from '@/utils/format';
import { durationDays, endDateForDuration, type FormErrors, type MedicationFormState } from '@/utils/medicationForm';
import { ChoiceDialog, type Choice } from './ChoiceDialog';
import { MealIcon } from './MealIcon';
import { PhotoField } from './PhotoField';
import { TimePickerDialog } from './TimePickerDialog';

interface Props {
  value: MedicationFormState;
  onChange: (next: MedicationFormState) => void;
  errors: FormErrors;
  medId: string;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const MEALS: { value: FoodTiming; label: string }[] = [
  { value: 'BEFORE_FOOD', label: 'Before meal' },
  { value: 'WITH_FOOD', label: 'With meal' },
  { value: 'AFTER_FOOD', label: 'After meal' },
];
const PRESETS = [
  { time: '08:00', label: 'Morning' },
  { time: '13:00', label: 'Afternoon' },
  { time: '18:00', label: 'Evening' },
  { time: '21:00', label: 'Night' },
];
const DURATIONS: Choice<number | null>[] = [
  { value: null, label: 'Ongoing', description: 'No end date' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

export function MedicationForm({ value: f, onChange, errors, medId }: Props) {
  const set = <K extends keyof MedicationFormState>(k: K, v: MedicationFormState[K]) => onChange({ ...f, [k]: v });
  const c = useThemeColors();
  const [picker, setPicker] = useState<{ open: boolean; editing?: string }>({ open: false });
  const [durationOpen, setDurationOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [more, setMore] = useState(Boolean(f.instructions || f.avoid.length || f.precautions || f.prescriber || f.notes));
  const [newAvoid, setNewAvoid] = useState('');

  const today = toDateKey(new Date());
  const tomorrow = toDateKey(addDays(new Date(), 1));
  const days = durationDays(f.startDate, f.endDate);
  const everyday = f.frequency === 'DAILY';
  const hasErrors = Object.keys(errors).length > 0;

  const setTime = (oldTime: string | undefined, t: string) => set('times', [...f.times.filter((x) => x !== oldTime && x !== t), t].sort());
  const dayOn = (d: number) => everyday || (f.frequency === 'SPECIFIC_DAYS' && f.daysOfWeek.includes(d));
  const toggleDay = (d: number) => {
    const current = everyday ? [0, 1, 2, 3, 4, 5, 6] : f.frequency === 'SPECIFIC_DAYS' ? f.daysOfWeek : [];
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    onChange({ ...f, frequency: next.length === 7 ? 'DAILY' : 'SPECIFIC_DAYS', daysOfWeek: next.length === 7 ? [] : next });
  };
  const startLabel = f.startDate === today ? 'Starts today' : f.startDate === tomorrow ? 'Starts tomorrow' : `Starts ${fromDateKey(f.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <View className="gap-7">
      {hasErrors ? <FormAlert message={errors.form ?? 'Please check the items marked below.'} /> : null}

      <FormSection title="Which medicine?">
        <View className="flex-row items-start gap-3">
          <View className="mt-1 h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Icon as={Stethoscope} size={22} className="text-secondary-foreground" />
          </View>
          <View className="flex-1 gap-3">
            <FormField label="Medicine name" placeholder="e.g. Metformin" value={f.name} onChangeText={(v) => set('name', v)} error={errors.name} autoCapitalize="words" />
            <FormField label="Strength" placeholder="e.g. 500 mg" value={f.dosage} onChangeText={(v) => set('dosage', v)} error={errors.dosage} />
          </View>
        </View>
      </FormSection>

      <PhotoField medId={medId} name={f.name} unit={f.unit} existingUrl={f.existingImageUrl} value={f.photo} onChange={(p) => set('photo', p)} />

      <FormSection title="Dosage" subtitle="How much each time">
        <View className="flex-row items-center gap-3">
          <SquareButton label="Less" icon={Minus} disabled={f.doseQuantity <= 0.5} onPress={() => set('doseQuantity', Math.max(0.5, f.doseQuantity - 0.5))} />
          <View className="min-w-16 items-center" accessible accessibilityLabel={`${formatQuantity(f.doseQuantity)} ${UNIT_LABEL[f.unit].many}`}>
            <Text className="text-3xl font-extrabold">{formatQuantity(f.doseQuantity)}</Text>
          </View>
          <SquareButton label="More" icon={Plus} disabled={f.doseQuantity >= 20} onPress={() => set('doseQuantity', Math.min(20, f.doseQuantity + 0.5))} />
          <Text className="flex-1 text-lg font-semibold text-muted-foreground">
            {f.doseQuantity > 1 ? UNIT_LABEL[f.unit].many : UNIT_LABEL[f.unit].one}
          </Text>
        </View>
        <FieldError message={errors.doseQuantity} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-4" role="radiogroup" accessibilityLabel="Type of medicine">
          {DOSE_UNITS.map((u) => (
            <Chip key={u} label={UNIT_LABEL[u].one} selected={f.unit === u} onPress={() => set('unit', u)} />
          ))}
        </ScrollView>
      </FormSection>

      <FormSection title="Consume with meal">
        <View className="flex-row gap-2" role="radiogroup">
          {MEALS.map((m) => {
            const selected = f.foodTiming === m.value;
            return (
              <Pressable
                key={m.value}
                role="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={m.label}
                onPress={() => set('foodTiming', m.value)}
                className={cn('min-h-20 flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-1 py-3', selected ? 'border-foreground bg-blush' : 'border-border bg-card')}
              >
                <MealIcon timing={m.value} color={c.foreground} size={20} />
                <Text className={cn('text-center text-sm', selected ? 'font-bold' : 'font-medium')}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row flex-wrap gap-2" role="radiogroup">
          <Chip label="Empty stomach" selected={f.foodTiming === 'EMPTY_STOMACH'} onPress={() => set('foodTiming', 'EMPTY_STOMACH')} />
          <Chip label="Any time" selected={f.foodTiming === 'ANY'} onPress={() => set('foodTiming', 'ANY')} />
        </View>
        <FieldError message={errors.foodTiming} />
        <FormField label="Food note (optional)" placeholder="e.g. After breakfast" value={f.foodInstructions} onChangeText={(v) => set('foodInstructions', v)} />
      </FormSection>

      <FormSection title="Schedule">
        {f.frequency === 'EVERY_N_DAYS' ? (
          <Stepper label="days apart" value={f.intervalDays} min={2} max={30} step={1} format={(v) => `Every ${v} days`} onChange={(v) => set('intervalDays', v)} />
        ) : (
          <View className="flex-row justify-between">
            {WEEK_ORDER.map((d) => {
              const on = dayOn(d);
              return (
                <Pressable
                  key={d}
                  role="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={DAY_NAMES[d]}
                  onPress={() => toggleDay(d)}
                  className={cn('h-12 w-12 items-center justify-center rounded-full border-2', on ? 'border-blush bg-blush' : 'border-border bg-card')}
                >
                  <Text className={cn('text-sm', on ? 'font-extrabold' : 'font-semibold text-muted-foreground')}>{DAYS[d]}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <FieldError message={errors.daysOfWeek} />
        <View className="flex-row flex-wrap items-center gap-x-4">
          <Checkbox label="Everyday" checked={everyday} onChange={(v) => onChange({ ...f, frequency: v ? 'DAILY' : 'SPECIFIC_DAYS', daysOfWeek: v ? [] : [1, 2, 3, 4, 5] })} />
          <Checkbox label="Every few days" checked={f.frequency === 'EVERY_N_DAYS'} onChange={(v) => set('frequency', v ? 'EVERY_N_DAYS' : 'DAILY')} />
        </View>
      </FormSection>

      <FormSection title="Reminder times" subtitle="Your phone will remind you at these times">
        <View className="gap-2">
          {f.times.map((t) => (
            <SelectPill
              key={t}
              label={`At ${formatTime(atLocalTime(new Date(), t))}`}
              accessibilityLabel={`Reminder at ${formatTime(atLocalTime(new Date(), t))}. Change time`}
              onPress={() => setPicker({ open: true, editing: t })}
              onRemove={f.times.length > 1 ? () => set('times', f.times.filter((x) => x !== t)) : undefined}
            />
          ))}
        </View>
        <FieldError message={errors.times} />
        <View className="flex-row flex-wrap gap-2">
          {PRESETS.filter((p) => !f.times.includes(p.time)).map((p) => (
            <Chip key={p.time} icon={Plus} kind="checkbox" selected={false} label={`${p.label} ${formatTime(atLocalTime(new Date(), p.time))}`} onPress={() => setTime(undefined, p.time)} />
          ))}
          <Chip icon={Plus} kind="checkbox" selected={false} label="Other time" onPress={() => setPicker({ open: true })} />
        </View>
      </FormSection>

      <FormSection title="How long">
        <View className="flex-row gap-2">
          <SelectPill className="flex-1" label={startLabel} onPress={() => setStartOpen(true)} />
          <SelectPill className="flex-1" label={days === null ? 'Ongoing' : `${days} days`} accessibilityLabel="Course length" onPress={() => setDurationOpen(true)} />
        </View>
        <FieldError message={errors.endDate} />
      </FormSection>

      <View className="gap-4">
        <Pressable role="button" accessibilityState={{ expanded: more }} onPress={() => setMore((m) => !m)} className="min-h-12 flex-row items-center justify-between rounded-full bg-muted px-5">
          <Text className="font-bold">More details (optional)</Text>
          <Icon as={more ? ChevronUp : ChevronDown} size={20} />
        </Pressable>
        {more ? (
          <View className="gap-4">
            <FormField label="How to take it" placeholder="e.g. Swallow whole with water" value={f.instructions} onChangeText={(v) => set('instructions', v)} multiline />
            <View className="gap-2">
              <Text className="font-semibold">Things to avoid (from your doctor or label)</Text>
              {f.avoid.map((a, i) => (
                <View key={`${a}-${i}`} className="flex-row items-center gap-2 rounded-full bg-warning-soft py-1 pl-5 pr-1">
                  <Text className="flex-1 font-medium text-warning">{a}</Text>
                  <Button variant="ghost" size="icon" onPress={() => set('avoid', f.avoid.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${a}`}>
                    <Icon as={X} size={20} className="text-warning" />
                  </Button>
                </View>
              ))}
              <View className="flex-row items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="e.g. Grapefruit juice"
                  value={newAvoid}
                  onChangeText={setNewAvoid}
                  accessibilityLabel="Something to avoid"
                  onSubmitEditing={() => {
                    if (newAvoid.trim()) {
                      set('avoid', [...f.avoid, newAvoid.trim()]);
                      setNewAvoid('');
                    }
                  }}
                />
                <Button size="icon" disabled={!newAvoid.trim()} accessibilityLabel="Add" onPress={() => {
                  set('avoid', [...f.avoid, newAvoid.trim()]);
                  setNewAvoid('');
                }}>
                  <Icon as={Plus} size={22} className="text-primary-foreground" />
                </Button>
              </View>
            </View>
            <FormField label="Other precautions" value={f.precautions} onChangeText={(v) => set('precautions', v)} multiline />
            <FormField label="Prescribed by" placeholder="e.g. Dr. Sharma" value={f.prescriber} onChangeText={(v) => set('prescriber', v)} />
            <FormField label="Notes" value={f.notes} onChangeText={(v) => set('notes', v)} multiline />
          </View>
        ) : null}
      </View>

      <TimePickerDialog open={picker.open} initial={picker.editing ?? '08:00'} onOpenChange={(open) => setPicker((p) => ({ ...p, open }))} onConfirm={(t) => setTime(picker.editing, t)} />
      <ChoiceDialog
        open={durationOpen}
        onOpenChange={setDurationOpen}
        title="How long will you take it?"
        choices={DURATIONS}
        selected={days}
        onSelect={(d) => set('endDate', d === null ? null : endDateForDuration(f.startDate, d))}
      />
      <ChoiceDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        title="When do you start?"
        choices={[
          { value: today, label: 'Today' },
          { value: tomorrow, label: 'Tomorrow' },
          ...(f.startDate !== today && f.startDate !== tomorrow ? [{ value: f.startDate, label: fromDateKey(f.startDate).toLocaleDateString() }] : []),
        ]}
        selected={f.startDate}
        onSelect={(s) => onChange({ ...f, startDate: s, endDate: days ? endDateForDuration(s, days) : null })}
      />
    </View>
  );
}

function SquareButton({ label, icon, onPress, disabled }: { label: string; icon: typeof Plus; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${label} amount`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn('h-12 w-12 items-center justify-center rounded-xl border-2 border-foreground bg-card active:bg-muted', disabled && 'opacity-40')}
    >
      <Icon as={icon} size={22} strokeWidth={2.6} />
    </Pressable>
  );
}
