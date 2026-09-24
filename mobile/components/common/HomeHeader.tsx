import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { greeting } from '@/utils/date';

interface Props {
  name: string;
  now: Date;
  /** Right-hand round button (reminders status, alerts…). */
  action: { icon: LucideIcon; label: string; onPress: () => void; iconClass?: string; badge?: number };
}

/**
 * Home top bar: avatar · date + greeting · one round action. One block instead of three loose
 * pieces, so it reads as a header on phones and on wide screens alike.
 */
export function HomeHeader({ name, now, action }: Props) {
  const first = name.split(' ')[0] ?? '';
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => router.navigate('/profile')}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        className="h-14 w-14 items-center justify-center rounded-full bg-blush active:opacity-80"
      >
        <Text className="text-xl font-extrabold text-blush-foreground">{first.slice(0, 1).toUpperCase() || '🙂'}</Text>
      </Pressable>

      <View className="flex-1">
        <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground" numberOfLines={1}>
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
        </Text>
        <Text role="heading" className="text-2xl font-extrabold leading-8 tracking-tight" numberOfLines={2}>
          {greeting(now)}
          {first ? `, ${first}` : ''}
        </Text>
      </View>

      <Pressable
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        className="h-12 w-12 items-center justify-center rounded-full border border-border bg-card active:bg-accent"
      >
        <Icon as={action.icon} size={22} className={cn('text-foreground', action.iconClass)} />
        {action.badge ? (
          <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1">
            <Text className="text-[11px] font-bold text-destructive-foreground">{action.badge > 9 ? '9+' : action.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
