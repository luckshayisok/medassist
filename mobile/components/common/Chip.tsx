import { Check, type LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** 'radio' for single choice groups, 'checkbox' for multi-select. */
  kind?: 'radio' | 'checkbox';
  className?: string;
}

/** A large selectable pill. Selected state = fill + check icon, not colour alone. */
export function Chip({ label, selected, onPress, icon, kind = 'radio', className }: Props) {
  return (
    <Pressable
      role={kind}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        'min-h-12 flex-row items-center justify-center gap-2 rounded-full border-2 px-4',
        selected ? 'border-primary bg-primary' : 'border-border bg-card active:bg-accent',
        className,
      )}
    >
      {selected ? (
        <Icon as={Check} size={18} strokeWidth={3} className="text-primary-foreground" />
      ) : icon ? (
        <Icon as={icon} size={18} className="text-foreground" />
      ) : null}
      <Text className={cn('text-base font-bold', selected ? 'text-primary-foreground' : 'text-foreground')}>{label}</Text>
    </Pressable>
  );
}
