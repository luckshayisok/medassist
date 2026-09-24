import { TriangleAlert } from 'lucide-react-native';
import { forwardRef, useId } from 'react';
import { TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type Props = React.ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  hint?: string;
};

export const FormField = forwardRef<TextInput, Props>(function FormField({ label, error, hint, className, ...input }, ref) {
  const id = useId();
  return (
    <View className="gap-2">
      <Label nativeID={id}>{label}</Label>
      <Input
        ref={ref}
        aria-labelledby={id}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        className={cn(input.multiline && 'min-h-24 rounded-3xl py-4', error && 'border-destructive', className)}
        {...input}
      />
      {error ? (
        <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
          <Icon as={TriangleAlert} size={20} className="text-destructive" />
          <Text className="flex-1 font-semibold text-destructive">{error}</Text>
        </View>
      ) : hint ? (
        <Text className="text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
});
