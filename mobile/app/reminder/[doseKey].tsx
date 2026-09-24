import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { AlarmClock, Check, CircleCheck, Clock, GlassWater, House, Pill, ShieldAlert, SkipForward, TriangleAlert, Undo2, Utensils, Volume2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { MedAvatar } from '@/components/medication/MedAvatar';
import { StatusBadge } from '@/components/medication/StatusBadge';
import { InfoBlock } from '@/components/reminder/InfoBlock';
import { SkipDialog } from '@/components/reminder/SkipDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { SNOOZE_OPTIONS } from '@/constants/app';
import { useDose } from '@/hooks/useTodayDoses';
import { useDoseLogs } from '@/store/doseLogStore';
import { useSettings } from '@/store/settingsStore';
import { formatTime } from '@/utils/date';
import { foodLine, formatDose } from '@/utils/format';

export default function ReminderScreen() {
  const { doseKey } = useLocalSearchParams<{ doseKey: string }>();
  const { dose } = useDose(doseKey);
  const { markTaken, snooze, skip, undo } = useDoseLogs();
  const readAloudEnabled = useSettings((s) => s.readAloud);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => () => void Speech.stop(), []);

  if (!dose) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <Text className="text-xl font-bold">This dose is no longer on today's schedule.</Text>
        <Button onPress={() => router.replace('/')}>
          <Icon as={House} size={24} />
          <Text>Back to home</Text>
        </Button>
      </Screen>
    );
  }

  const m = dose.medication;
  const time = formatTime(dose.scheduledFor);
  const done = dose.status === 'TAKEN' || dose.status === 'SKIPPED';

  const readAloud = () => {
    Speech.stop();
    Speech.speak(
      `${m.name} ${m.dosage}. Take ${formatDose(m)} at ${time}. ${m.instructions ?? ''} ${foodLine(m)}. ` +
        m.avoid.map((a) => a.text).join(' '),
      { rate: 0.85 },
    );
  };

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View className="items-center gap-3">
        <MedAvatar medication={m} size="xl" />
        <Text role="heading" className="text-center text-3xl font-extrabold tracking-tight">
          {m.name} {m.dosage}
        </Text>
        <StatusBadge status={dose.status} className="self-center" />
      </View>

      {done ? (
        <Card className={dose.status === 'TAKEN' ? 'border-2 border-success' : 'border-2 border-border'}>
          <CardContent className="gap-3">
            <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
              <Icon as={dose.status === 'TAKEN' ? CircleCheck : SkipForward} size={32} className={dose.status === 'TAKEN' ? 'text-success' : 'text-muted-foreground'} />
              <Text className="flex-1 text-xl font-bold">
                {dose.status === 'TAKEN' ? 'Well done! Recorded as taken.' : 'Recorded as skipped.'}
              </Text>
            </View>
            <View className="flex-row gap-6">
              <View>
                <Text className="text-muted-foreground">Scheduled</Text>
                <Text className="text-lg font-bold">{time}</Text>
              </View>
              {dose.log?.takenAt ? (
                <View>
                  <Text className="text-muted-foreground">Taken</Text>
                  <Text className="text-lg font-bold">{formatTime(new Date(dose.log.takenAt))}</Text>
                </View>
              ) : null}
            </View>
            <Button size="lg" onPress={() => router.back()}>
              <Icon as={House} size={26} />
              <Text>Back to home</Text>
            </Button>
            <Button variant="outline" onPress={() => undo(dose.doseKey)}>
              <Icon as={Undo2} size={24} />
              <Text>Undo</Text>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <View className="gap-3">
          <Button
            testID="reminder-took-it"
            size="lg"
            variant="success"
            className="min-h-20"
            accessibilityHint={`Records that you took ${m.name} now`}
            onPress={() => markTaken(dose)}
          >
            <Icon as={Check} size={32} strokeWidth={3} className="text-success-foreground" />
            <Text className="text-2xl">I TOOK IT</Text>
          </Button>
          {showSnooze ? (
            <Card>
              <CardContent className="gap-3">
                <Text className="text-lg font-bold">Remind me again in:</Text>
                {SNOOZE_OPTIONS.map((o) => (
                  <Button
                    key={o.minutes}
                    variant="secondary"
                    onPress={() => {
                      snooze(dose, o.minutes);
                      router.back();
                    }}
                  >
                    <Icon as={AlarmClock} size={24} />
                    <Text>{o.label}</Text>
                  </Button>
                ))}
                <Button variant="ghost" onPress={() => setShowSnooze(false)}>
                  <Text>Cancel</Text>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <View className="flex-row gap-3">
              <Button variant="outline" className="flex-1" onPress={() => setShowSnooze(true)}>
                <Icon as={AlarmClock} size={24} />
                <Text>Snooze</Text>
              </Button>
              <Button variant="outline" className="flex-1 border-destructive" onPress={() => setShowSkip(true)}>
                <Icon as={SkipForward} size={24} className="text-destructive" />
                <Text className="text-destructive">Skip</Text>
              </Button>
            </View>
          )}
        </View>
      )}

      <InfoBlock icon={Pill} title="Take">
        <Text className="text-2xl font-bold">{formatDose(m)}</Text>
      </InfoBlock>
      <InfoBlock icon={Clock} title="When">
        <Text className="text-2xl font-bold">{time}</Text>
      </InfoBlock>
      {m.instructions ? (
        <InfoBlock icon={GlassWater} title="How">
          <Text>{m.instructions}</Text>
        </InfoBlock>
      ) : null}
      <InfoBlock icon={Utensils} title="Food">
        <Text>{foodLine(m)}</Text>
      </InfoBlock>
      {m.avoid.length > 0 ? (
        <InfoBlock icon={TriangleAlert} title="Avoid" tone="warning">
          {m.avoid.map((a) => (
            <View key={a.text} className="gap-0.5">
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

      {readAloudEnabled ? (
        <Button variant="secondary" onPress={readAloud}>
          <Icon as={Volume2} size={24} />
          <Text>Read aloud</Text>
        </Button>
      ) : null}

      <SkipDialog
        open={showSkip}
        medicationName={m.name}
        onOpenChange={setShowSkip}
        onConfirm={(reason) => {
          skip(dose, reason);
          setShowSkip(false);
        }}
      />
    </Screen>
  );
}
