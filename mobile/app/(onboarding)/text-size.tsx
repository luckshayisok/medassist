import { Check } from 'lucide-react-native';
import { View } from 'react-native';
import { SettingSwitch } from '@/components/accessibility/SettingSwitch';
import { TextSizePicker } from '@/components/accessibility/TextSizePicker';
import { Screen } from '@/components/common/Screen';
import { StepHeader } from '@/components/common/StepHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSettings } from '@/store/settingsStore';

export default function TextSizeScreen() {
  const { highContrast, setHighContrast, completeOnboarding } = useSettings();

  return (
    <Screen>
      <StepHeader step={3} total={3} title="Choose text size" subtitle="Pick the size that is easiest for you to read. You can change it later in Profile." />
      <TextSizePicker />
      <Card>
        <CardContent>
          <SettingSwitch
            title="High contrast"
            description="Bright text on a black background"
            checked={highContrast}
            onCheckedChange={setHighContrast}
          />
        </CardContent>
      </Card>
      <View className="mt-2">
        {/* Flipping the onboarding guard makes the router move to sign-in automatically. */}
        <Button size="lg" onPress={completeOnboarding}>
          <Icon as={Check} size={26} />
          <Text>Done</Text>
        </Button>
      </View>
    </Screen>
  );
}
