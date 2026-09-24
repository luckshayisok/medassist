import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      role="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      className="min-h-12 flex-row items-center gap-3 self-start pr-2"
    >
      <View className={cn('h-7 w-7 items-center justify-center rounded-[7px] border-2 border-foreground', checked && 'bg-foreground')}>
        {checked ? <Icon as={Check} size={18} strokeWidth={3.2} className="text-background" /> : null}
      </View>
      <Text className="text-base font-semibold">{label}</Text>
    </Pressable>
  );
}
