import { View } from 'react-native';
import { ChoiceCard } from '@/components/common/ChoiceCard';
import { Text } from '@/components/ui/text';
import { REM, type TextSize } from '@/lib/theme';
import { useSettings } from '@/store/settingsStore';

const SIZES: { value: TextSize; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

export function TextSizePicker() {
  const textSize = useSettings((s) => s.textSize);
  const setTextSize = useSettings((s) => s.setTextSize);

  return (
    <View role="radiogroup" accessibilityLabel="Text size" className="gap-3">
      {SIZES.map((s) => (
        <ChoiceCard
          key={s.value}
          title={s.label}
          selected={textSize === s.value}
          onPress={() => setTextSize(s.value)}
          leading={
            // Fixed pixel size so each preview shows its own size, not the current setting.
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Text importantForAccessibility="no" style={{ fontSize: REM[s.value] * 1.3, lineHeight: REM[s.value] * 1.6 }} className="font-bold">
                A
              </Text>
            </View>
          }
        />
      ))}
    </View>
  );
}
