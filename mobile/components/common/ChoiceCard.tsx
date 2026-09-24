import type { LucideIcon } from 'lucide-react-native';
import { Circle, CircleCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface Props {
  selected: boolean;
  onPress: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Custom leading content (e.g. a text-size preview). */
  leading?: ReactNode;
}

/**
 * A large, full-width radio option. Selection is shown by border, fill, icon AND the word
 * "Selected". The text column gets all spare width so large text never breaks mid-word.
 */
export function ChoiceCard({ selected, onPress, title, description, icon, leading }: Props) {
  return (
    <Pressable
      role="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={onPress}
      className={cn(
        'min-h-16 flex-row items-center gap-3 rounded-2xl border-2 bg-card p-4 active:bg-accent',
        selected ? 'border-primary bg-accent' : 'border-border',
      )}
    >
      {leading ??
        (icon ? (
          <View className={cn('h-11 w-11 items-center justify-center rounded-xl', selected ? 'bg-primary' : 'bg-muted')}>
            <Icon as={icon} size={24} className={selected ? 'text-primary-foreground' : 'text-foreground'} />
          </View>
        ) : null)}
      <View className="flex-1 gap-0.5">
        <Text className="text-lg font-bold">{title}</Text>
        {description ? <Text className="text-muted-foreground">{description}</Text> : null}
        {selected ? <Text className="font-bold text-primary">Selected</Text> : null}
      </View>
      <Icon as={selected ? CircleCheck : Circle} size={28} className={selected ? 'text-primary' : 'text-muted-foreground'} />
    </Pressable>
  );
}
