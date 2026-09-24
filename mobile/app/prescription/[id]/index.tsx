import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CircleAlert,
  CircleCheck,
  FileText,
  Keyboard,
  Pencil,
  RotateCcw,
  ScanLine,
  Sparkles,
  Square,
  SquareCheck,
  TriangleAlert,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Checkbox } from '@/components/common/Checkbox';
import { FormAlert } from '@/components/common/FormAlert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { medicationsKey } from '@/hooks/useMedications';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/services/api/client';
import { prescriptionsApi } from '@/services/api/prescriptions';
import { useAuth } from '@/store/authStore';
import { usePrescriptionReview, type ReviewItem } from '@/store/prescriptionReviewStore';
import { atLocalTime, formatTime } from '@/utils/date';
import { FOOD_TIMING_LABEL, formatDose } from '@/utils/format';
import { toPayload, validate } from '@/utils/medicationForm';

const STEPS = ['Uploading photo', 'Reading the handwriting', 'Finding each medicine'];

export default function PrescriptionReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  const q = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => prescriptionsApi.get(id!),
    enabled: !!id,
    // Poll while the server is still reading.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'UPLOADED' || s === 'PROCESSING' ? 2000 : false;
    },
  });
  const p = q.data;
  const start = usePrescriptionReview((s) => s.start);
  const items = usePrescriptionReview((s) => (id ? s.byPrescription[id] : undefined));
  const toggle = usePrescriptionReview((s) => s.toggle);
  const clear = usePrescriptionReview((s) => s.clear);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);

  useEffect(() => {
    if (p?.status === 'NEEDS_REVIEW') start(p);
  }, [p, start]);

  const selected = useMemo(() => (items ?? []).map((it, i) => ({ it, i })).filter(({ it }) => it.include), [items]);
  const problems = useMemo(() => new Map(selected.map(({ it, i }) => [i, validate(it.form)])), [selected]);
  const blocking = [...problems.values()].filter((e) => Object.keys(e).length > 0).length;

  const confirm = async () => {
    if (!p || !id) return;
    setError(undefined);
    if (!selected.length) return setError('Choose at least one medicine to add.');
    if (blocking) return setError(`${blocking === 1 ? 'One medicine needs' : `${blocking} medicines need`} a few details before they can be added. Tap "Check & edit".`);
    if (!confirmed) return setError('Please tick the box to confirm you checked everything against your prescription.');
    setSaving(true);
    try {
      await prescriptionsApi.verify(
        id,
        selected.map(({ it }) => ({ draftId: it.draftId, medication: toPayload(it.form) })),
      );
      clear(id);
      await qc.invalidateQueries({ queryKey: medicationsKey(userId) });
      router.replace('/medicines');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the medicines. Please try again.');
      setSaving(false);
    }
  };

  const header = (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between bg-background px-4 pb-2">
      <Pressable role="button" accessibilityLabel="Close" onPress={() => router.back()} className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground">
        <Icon as={X} size={22} />
      </Pressable>
      <Text role="heading" className="text-lg font-bold">
        {p?.status === 'NEEDS_REVIEW' ? 'Check your medicines' : 'Your prescription'}
      </Text>
      <View className="h-12 w-12" />
    </View>
  );

  if (!p) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center">
          {q.isError ? <Text>Could not load this prescription.</Text> : <ActivityIndicator size="large" />}
        </View>
      </View>
    );
  }

  if (p.status === 'UPLOADED' || p.status === 'PROCESSING') {
    const step = p.status === 'UPLOADED' ? 1 : 2;
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 justify-center gap-6 px-6" accessibilityLiveRegion="polite">
          <View className="items-center gap-4 rounded-[28px] bg-secondary p-8">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-primary">
              <Icon as={Sparkles} size={36} className="text-primary-foreground" />
            </View>
            <Text className="text-center text-2xl font-extrabold text-secondary-foreground">Reading your prescription…</Text>
            <Text className="text-center font-medium text-secondary-foreground">This can take up to a minute. You can wait here.</Text>
          </View>
          <View className="gap-3">
            {STEPS.map((s, i) => (
              <View key={s} className="flex-row items-center gap-3">
                {i < step ? <Icon as={CircleCheck} size={24} className="text-success" /> : i === step ? <ActivityIndicator /> : <View className="h-6 w-6 rounded-full border-2 border-border" />}
                <Text className={cn('text-lg', i <= step ? 'font-bold' : 'text-muted-foreground')}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (p.status === 'FAILED') {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScrollView contentContainerClassName="gap-4 p-4">
          <View className="items-center gap-3 rounded-[28px] bg-accent p-6">
            <Icon as={CircleAlert} size={40} className="text-foreground" />
            <Text className="text-center text-2xl font-extrabold">We couldn't read it</Text>
            <Text className="text-center font-medium">{p.errorMessage ?? 'Please try again.'}</Text>
          </View>
          {p.warnings.map((w) => (
            <Text key={w} className="text-muted-foreground">• {w}</Text>
          ))}
          {p.canRetry ? (
            <Button
              size="lg"
              onPress={async () => {
                await prescriptionsApi.retry(p.id).catch(() => {});
                void q.refetch();
              }}
            >
              <Icon as={RotateCcw} size={22} className="text-primary-foreground" />
              <Text>Try reading again</Text>
            </Button>
          ) : null}
          <Button variant="outline" className="border-2" onPress={() => router.replace('/prescription/scan')}>
            <Icon as={ScanLine} size={22} />
            <Text>Take a new photo</Text>
          </Button>
          <Button variant="ghost" onPress={() => router.replace('/medication/new')}>
            <Icon as={Keyboard} size={22} />
            <Text>Add the medicine myself</Text>
          </Button>
        </ScrollView>
      </View>
    );
  }

  if (p.status === 'VERIFIED') {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="m-4 items-center gap-3 rounded-[28px] bg-success-soft p-6">
          <Icon as={CircleCheck} size={40} className="text-success" />
          <Text className="text-center text-2xl font-extrabold">Already added</Text>
          <Button onPress={() => router.replace('/medicines')}>
            <Text>See my medicines</Text>
          </Button>
        </View>
      </View>
    );
  }

  // NEEDS_REVIEW
  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView contentContainerClassName="gap-4 px-4 pt-2" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View role="alert" className="flex-row gap-3 rounded-3xl border-2 border-warning bg-warning-soft p-4">
          <Icon as={TriangleAlert} size={24} className="text-warning" />
          <View className="flex-1 gap-1">
            <Text className="font-extrabold text-warning">Please review the information below.</Text>
            <Text className="font-medium text-warning">AI can make mistakes. Confirm your prescription before creating reminders.</Text>
          </View>
        </View>

        <Pressable role="button" accessibilityLabel={showPhoto ? 'Hide prescription photo' : 'Show prescription photo'} onPress={() => setShowPhoto((v) => !v)} className="flex-row items-center gap-3 rounded-3xl bg-card p-3">
          <Image source={{ uri: resolveFileUrl(p.imageUrl)! }} className="h-14 w-14 rounded-xl bg-muted" />
          <View className="flex-1">
            <Text className="font-bold">{p.prescriber ?? 'Your prescription'}</Text>
            <Text className="text-muted-foreground">{showPhoto ? 'Tap to hide the photo' : 'Tap to compare with the photo'}</Text>
          </View>
          <Icon as={FileText} size={22} />
        </Pressable>
        {showPhoto ? <Image source={{ uri: resolveFileUrl(p.imageUrl)! }} resizeMode="contain" className="h-[480px] w-full rounded-3xl bg-muted" accessibilityLabel="Prescription photo" /> : null}

        {p.warnings.length ? (
          <View className="gap-1 rounded-3xl bg-accent p-4">
            <Text className="font-extrabold">Please double-check</Text>
            {p.warnings.map((w) => (
              <Text key={w} className="font-medium">• {w}</Text>
            ))}
          </View>
        ) : null}

        <Text role="heading" className="mt-2 text-xl font-extrabold">
          We found {items?.length ?? 0} {items?.length === 1 ? 'medicine' : 'medicines'}
        </Text>
        {(items ?? []).map((it, i) => (
          <DraftCard key={it.draftId} item={it} index={i} source={p.medications[i]?.sourceText ?? null} errors={problems.get(i) ?? {}} onToggle={() => toggle(p.id, i)} prescriptionId={p.id} />
        ))}

        <View className="mt-2 gap-3 rounded-[28px] border border-border bg-card p-4">
          <Checkbox label="I have checked these details against my prescription" checked={confirmed} onChange={setConfirmed} />
          <FormAlert message={error} />
          <Button size="lg" disabled={saving} onPress={confirm}>
            <Icon as={CircleCheck} size={24} className="text-primary-foreground" />
            <Text>{saving ? 'Adding…' : `Add ${selected.length} ${selected.length === 1 ? 'medicine' : 'medicines'}`}</Text>
          </Button>
          <Text className="text-center text-sm text-muted-foreground">Reminders start only after you add them.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DraftCard({ item, index, source, errors, onToggle, prescriptionId }: { item: ReviewItem; index: number; source: string | null; errors: Record<string, string>; onToggle: () => void; prescriptionId: string }) {
  const f = item.form;
  const missing = Object.keys(errors).length > 0;
  const today = new Date();
  return (
    <View className={cn('gap-3 rounded-[28px] border-2 bg-card p-4', !item.include ? 'border-border opacity-70' : missing ? 'border-destructive' : 'border-border')}>
      <Pressable role="checkbox" accessibilityState={{ checked: item.include }} accessibilityLabel={`Add ${f.name || 'this medicine'}`} onPress={onToggle} className="flex-row items-center gap-3">
        <Icon as={item.include ? SquareCheck : Square} size={28} />
        <View className="flex-1">
          <Text className="text-xl font-extrabold">{f.name || 'Name not readable'}</Text>
          <Text className="text-muted-foreground">{[f.dosage, formatDose(f)].filter(Boolean).join(' · ')}</Text>
        </View>
      </Pressable>

      {source ? (
        <View className="rounded-2xl bg-muted px-3 py-2">
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">On the paper</Text>
          <Text className="font-medium">{source}</Text>
        </View>
      ) : null}

      <View className="gap-1">
        <Text className="font-medium">
          ⏰ {f.times.length ? f.times.map((t) => formatTime(atLocalTime(today, t))).join(', ') : 'Times not set'}
        </Text>
        <Text className="font-medium">🍽 {f.foodTiming ? FOOD_TIMING_LABEL[f.foodTiming] : 'Food timing not set'}</Text>
      </View>

      {item.include && !item.checked
        ? item.attention.map((a) => (
            <View key={a.field + a.message} className="flex-row gap-2">
              <Icon as={TriangleAlert} size={18} className={errors[a.field === 'strength' ? 'dosage' : a.field] ? 'text-destructive' : 'text-warning'} />
              <Text className={cn('flex-1 text-sm font-semibold', errors[a.field === 'strength' ? 'dosage' : a.field] ? 'text-destructive' : 'text-warning')}>{a.message}</Text>
            </View>
          ))
        : null}

      <Button
        variant={missing && item.include ? 'default' : 'outline'}
        className={missing && item.include ? '' : 'border-2'}
        onPress={() => router.push({ pathname: '/prescription/[id]/[index]', params: { id: prescriptionId, index: String(index) } })}
      >
        <Icon as={Pencil} size={20} className={missing && item.include ? 'text-primary-foreground' : ''} />
        <Text>{item.checked ? 'Edit again' : 'Check & edit'}</Text>
      </Button>
    </View>
  );
}
