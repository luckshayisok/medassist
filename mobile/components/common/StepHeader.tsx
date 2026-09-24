import { View } from 'react-native';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';

export function StepHeader({ step, total, title, subtitle }: { step: number; total: number; title: string; subtitle?: string }) {
  return (
    <View className="gap-3">
      <Text className="font-semibold text-muted-foreground">
        Step {step} of {total}
      </Text>
      <Progress value={(step / total) * 100} className="h-2" accessibilityLabel={`Step ${step} of ${total}`} />
      <Text role="heading" className="mt-2 text-3xl font-extrabold tracking-tight">
        {title}
      </Text>
      {subtitle ? <Text className="text-lg text-muted-foreground">{subtitle}</Text> : null}
    </View>
  );
}
