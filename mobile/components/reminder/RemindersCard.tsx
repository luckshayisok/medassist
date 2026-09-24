import { BellOff, BellRing, Send } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReminderState } from '@/hooks/useReminders';
import { unsupportedReason } from '@/services/notifications/module';
import { countScheduledReminders, sendTestReminder } from '@/services/notifications/reconcile';
import { cn } from '@/lib/utils';

export function RemindersCard() {
  const permission = useReminderState((s) => s.permission);
  const lastSync = useReminderState((s) => s.lastSync);
  const requestPermission = useReminderState((s) => s.requestPermission);
  const [count, setCount] = useState<number | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (permission === 'granted') countScheduledReminders().then(setCount).catch(() => setCount(null));
  }, [permission, lastSync]);

  if (permission === 'unsupported') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          <CardDescription>
            {unsupportedReason() === 'expo-go-android'
              ? 'Expo Go on Android cannot show reminders. Install the MedAssist development build to test them — everything else works here.'
              : `Reminders work in the phone app (the ${Platform.OS} preview can't show them).`}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const on = permission === 'granted';
  return (
    <Card className={cn(!on && 'border-2 border-warning')}>
      <CardHeader className="flex-row items-center gap-3">
        <View className={cn('h-12 w-12 items-center justify-center rounded-2xl', on ? 'bg-success-soft' : 'bg-warning-soft')}>
          <Icon as={on ? BellRing : BellOff} size={26} className={on ? 'text-success' : 'text-warning'} />
        </View>
        <View className="flex-1">
          <CardTitle>Reminders are {on ? 'on' : 'off'}</CardTitle>
          <CardDescription>
            {on
              ? count !== null
                ? `${count} reminders set for the next few days`
                : 'Your phone will remind you at each medicine time'
              : 'Turn them on so your phone reminds you when it is time for a medicine.'}
          </CardDescription>
        </View>
      </CardHeader>
      <CardContent className="gap-3">
        {!on ? (
          <Button size="lg" className="rounded-2xl" onPress={() => void requestPermission()}>
            <Icon as={BellRing} size={24} />
            <Text>{permission === 'denied' ? 'Open phone settings' : 'Turn on reminders'}</Text>
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className="border-2"
              onPress={async () => {
                await sendTestReminder(10);
                setTestSent(true);
                setTimeout(() => setTestSent(false), 15_000);
              }}
            >
              <Icon as={Send} size={22} />
              <Text>Send a test reminder</Text>
            </Button>
            {testSent ? (
              <Text accessibilityLiveRegion="polite" className="text-center font-semibold text-success">
                A test reminder will appear in about 10 seconds. You can lock your phone to see it.
              </Text>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Shown on Home when reminders are off — the app's core job depends on them. */
export function RemindersOffBanner() {
  const permission = useReminderState((s) => s.permission);
  const requestPermission = useReminderState((s) => s.requestPermission);
  if (permission !== 'denied' && permission !== 'undetermined') return null;
  return (
    <View className="flex-row items-center gap-3 rounded-3xl border-2 border-warning bg-warning-soft p-4">
      <Icon as={BellOff} size={26} className="text-warning" />
      <View className="flex-1">
        <Text className="font-bold text-warning">Reminders are off</Text>
        <Text className="text-warning">You won't be reminded to take your medicines.</Text>
      </View>
      <Button size="sm" className="bg-warning" onPress={() => void requestPermission()}>
        <Text className="text-warning-foreground">Turn on</Text>
      </Button>
    </View>
  );
}
