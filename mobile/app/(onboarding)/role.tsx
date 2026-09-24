import { router } from 'expo-router';
import { ArrowRight, HeartHandshake, UserRound } from 'lucide-react-native';
import { View } from 'react-native';
import { ChoiceCard } from '@/components/common/ChoiceCard';
import { Screen } from '@/components/common/Screen';
import { StepHeader } from '@/components/common/StepHeader';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSettings } from '@/store/settingsStore';

export default function RoleScreen() {
  const role = useSettings((s) => s.role);
  const setRole = useSettings((s) => s.setRole);

  return (
    <Screen className="justify-between">
      <View className="gap-6">
        <StepHeader step={1} total={3} title="Who will use this app?" />
        <View role="radiogroup" className="gap-3">
          <ChoiceCard
            icon={UserRound}
            title="I take the medicines"
            description="I am the patient"
            selected={role === 'PATIENT'}
            onPress={() => setRole('PATIENT')}
          />
          <ChoiceCard
            icon={HeartHandshake}
            title="I help someone else"
            description="I am a family member or caregiver"
            selected={role === 'CAREGIVER'}
            onPress={() => setRole('CAREGIVER')}
          />
        </View>
      </View>
      <Button size="lg" disabled={!role} onPress={() => router.push('/notifications')}>
        <Text>Continue</Text>
        <Icon as={ArrowRight} size={26} />
      </Button>
    </Screen>
  );
}
