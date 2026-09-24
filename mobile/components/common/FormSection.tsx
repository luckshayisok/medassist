import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** Flat section on the cream page: bold heading, then content. */
export function FormSection({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text role="heading" className="text-xl font-extrabold tracking-tight">
            {title}
          </Text>
          {subtitle ? <Text className="text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" className="font-semibold text-destructive">
      ⚠ {message}
    </Text>
  );
}
