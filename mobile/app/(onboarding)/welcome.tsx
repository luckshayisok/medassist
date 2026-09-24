import { router } from 'expo-router';
import { ArrowRight, BellRing, BookOpenText, HeartPulse } from 'lucide-react-native';
import { View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { APP_NAME, DISCLAIMER } from '@/constants/app';

const POINTS = [
  { icon: BellRing, text: 'Reminds you when it is time for each medicine' },
  { icon: BookOpenText, text: 'Explains your prescription in simple words' },
  { icon: HeartPulse, text: 'Lets family help and keep an eye on things' },
];

export default function WelcomeScreen() {
  return (
    <Screen className="justify-between">
      <View className="gap-6 pt-4">
        <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary">
          <Icon as={HeartPulse} size={44} className="text-primary-foreground" />
        </View>
        <View className="gap-2">
          <Text role="heading" className="text-3xl font-extrabold tracking-tight">
            Welcome to {APP_NAME}
          </Text>
          <Text className="text-xl text-muted-foreground">
            We'll help you remember your medicines and understand your prescription.
          </Text>
        </View>
        <View className="gap-4">
          {POINTS.map((p) => (
            <View key={p.text} className="flex-row items-center gap-4">
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-accent">
                <Icon as={p.icon} size={26} className="text-primary" />
              </View>
              <Text className="flex-1 text-lg">{p.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <View className="gap-3">
        <Text className="text-sm text-muted-foreground">{DISCLAIMER}</Text>
        <Button size="lg" onPress={() => router.push('/role')}>
          <Text>Continue</Text>
          <Icon as={ArrowRight} size={26} />
        </Button>
      </View>
    </Screen>
  );
}
