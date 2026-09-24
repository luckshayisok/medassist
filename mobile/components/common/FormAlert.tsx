import { CircleAlert } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View
      role="alert"
      accessibilityLiveRegion="assertive"
      className="flex-row items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive-soft p-4"
    >
      <Icon as={CircleAlert} size={26} className="text-destructive" />
      <Text className="flex-1 font-semibold text-destructive">{message}</Text>
    </View>
  );
}
