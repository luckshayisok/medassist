import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  className?: string;
  /** Inside the tab bar: leave room for the floating bar. */
  tab?: boolean;
}

export function Screen({ children, scroll = true, edges = ['top', 'left', 'right'], className, tab }: Props) {
  const content = cn('gap-4 px-4 pb-8 pt-4', tab && 'pb-32', className);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerClassName={cn('grow', content)} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View className={cn('flex-1', content)}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
