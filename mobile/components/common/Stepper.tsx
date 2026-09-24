import { Minus, Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  label: string;
}

/** Big −/+ buttons instead of typing numbers. */
export function Stepper({ value, onChange, min, max, step, format = String, label }: Props) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 100) / 100));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 100) / 100));
  return (
    <View className="flex-row items-center gap-3" accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? inc() : dec())}
    >
      <Button variant="outline" size="icon" className="h-14 w-14 rounded-2xl border-2" disabled={value <= min} onPress={dec} accessibilityLabel={`Less ${label}`}>
        <Icon as={Minus} size={26} strokeWidth={2.6} />
      </Button>
      <View className="min-w-24 flex-1 items-center rounded-2xl bg-muted py-2">
        <Text className="text-3xl font-extrabold">{format(value)}</Text>
      </View>
      <Button variant="outline" size="icon" className="h-14 w-14 rounded-2xl border-2" disabled={value >= max} onPress={inc} accessibilityLabel={`More ${label}`}>
        <Icon as={Plus} size={26} strokeWidth={2.6} />
      </Button>
    </View>
  );
}
