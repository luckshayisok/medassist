import { Pressable, View } from 'react-native';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';

interface Props {
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

/** The whole row is the touch target, not just the small switch. */
export function SettingSwitch({ title, description, checked, onCheckedChange }: Props) {
  return (
    <Pressable
      role="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={() => onCheckedChange(!checked)}
      className="min-h-16 flex-row items-center gap-4 py-2"
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-lg font-bold">{title}</Text>
        {description ? <Text className="text-muted-foreground">{description}</Text> : null}
      </View>
      <Text className="font-semibold text-muted-foreground">{checked ? 'On' : 'Off'}</Text>
      <View importantForAccessibility="no-hide-descendants" className="scale-125">
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </View>
    </Pressable>
  );
}
