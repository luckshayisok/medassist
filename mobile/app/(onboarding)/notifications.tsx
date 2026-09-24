import { router } from 'expo-router';
import { ArrowRight, BellRing, Check } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { StepHeader } from '@/components/common/StepHeader';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { requestReminderPermission, type ReminderPermission } from '@/services/notifications/permissions';

export default function NotificationsStep() {
  const [result, setResult] = useState<ReminderPermission | null>(null);
  const next = () => router.push('/text-size');

  return (
    <Screen className="justify-between">
      <View className="gap-6">
        <StepHeader step={2} total={3} title="Turn on reminders" subtitle="Reminders let you know when it is time to take your medicine, even when the app is closed." />
        <View className="items-center gap-4 rounded-[28px] bg-card p-6">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-accent">
            <Icon as={BellRing} size={48} className="text-primary" />
          </View>
          <View className="w-full gap-2 rounded-2xl bg-muted p-4">
            <Text className="font-bold">💊 Time for Metformin 500 mg</Text>
            <Text className="text-muted-foreground">Take 1 tablet · After breakfast</Text>
          </View>
          <Text className="text-center text-muted-foreground">This is what a reminder looks like.</Text>
        </View>
        {result === 'granted' ? (
          <View className="flex-row items-center gap-3 rounded-2xl bg-success-soft p-4">
            <Icon as={Check} size={24} className="text-success" />
            <Text className="flex-1 font-bold text-success">Reminders are on</Text>
          </View>
        ) : result ? (
          <Text className="text-muted-foreground">No problem. You can turn reminders on later in Profile.</Text>
        ) : null}
      </View>

      <View className="gap-3 pt-6">
        {result === null ? (
          <>
            <Button
              size="lg"
              className="rounded-2xl"
              onPress={async () => {
                const r = await requestReminderPermission();
                setResult(r);
                if (r === 'granted' || r === 'unsupported') next();
              }}
            >
              <Icon as={BellRing} size={24} />
              <Text>Turn on reminders</Text>
            </Button>
            <Button variant="ghost" onPress={next}>
              <Text>Not now</Text>
            </Button>
          </>
        ) : (
          <Button size="lg" className="rounded-2xl" onPress={next}>
            <Text>Continue</Text>
            <Icon as={ArrowRight} size={24} />
          </Button>
        )}
      </View>
    </Screen>
  );
}
