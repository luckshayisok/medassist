import { ChevronDown, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  onPress: () => void;
  onRemove?: () => void;
  accessibilityLabel?: string;
  className?: string;
}

/** Dropdown-looking pill ("At 8:00 AM ⌄") that opens a big picker. */
export function SelectPill({ label, onPress, onRemove, accessibilityLabel, className }: Props) {
  return (
    <View className={cn('min-h-14 flex-row items-center rounded-full border-2 border-input bg-card', className)}>
      <Pressable
        role="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
        className="min-h-14 flex-1 flex-row items-center justify-between gap-2 pl-5 pr-4"
      >
        <Text className="text-base font-bold" numberOfLines={1}>
          {label}
        </Text>
        <Icon as={ChevronDown} size={20} className="text-foreground" />
      </Pressable>
      {onRemove ? (
        <Pressable role="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} className="h-14 w-12 items-center justify-center border-l border-input">
          <Icon as={X} size={20} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
