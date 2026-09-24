import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function InfoBlock({ icon, title, children, tone = 'default' }: { icon: LucideIcon; title: string; children: ReactNode; tone?: 'default' | 'warning' }) {
  const warn = tone === 'warning';
  return (
    <View className={cn('flex-row gap-4 rounded-2xl border p-4', warn ? 'border-warning bg-warning-soft' : 'border-border bg-card')}>
      <View className={cn('h-11 w-11 items-center justify-center rounded-xl', warn ? 'bg-warning' : 'bg-accent')}>
        <Icon as={icon} size={24} className={warn ? 'text-warning-foreground' : 'text-primary'} />
      </View>
      <View className="flex-1 gap-1">
        <Text role="heading" className={cn('text-sm font-bold uppercase tracking-wider', warn ? 'text-warning' : 'text-muted-foreground')}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}
