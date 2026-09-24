import { router } from 'expo-router';
import { ChevronRight, Keyboard, ScanLine, X, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Opened by the "+" button: scan a prescription (recommended) or type a medicine in. */
export default function AddChooser() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row items-center justify-between">
        <Pressable
          role="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground"
        >
          <Icon as={X} size={22} />
        </Pressable>
        <Text role="heading" className="text-lg font-bold">
          Add medicine
        </Text>
        <View className="h-12 w-12" />
      </View>

      <Text className="mb-6 mt-8 text-3xl font-extrabold tracking-tight">How would you like to add it?</Text>

      <View className="gap-4">
        <Option
          icon={ScanLine}
          title="Scan my prescription"
          description="Take a photo. We read the medicines for you to check."
          badge="Easiest"
          highlight
          onPress={() => router.replace('/prescription/scan')}
        />
        <Option icon={Keyboard} title="Type it in myself" description="Enter one medicine by hand." onPress={() => router.replace('/medication/new')} />
      </View>
    </View>
  );
}

function Option({ icon, title, description, badge, highlight, onPress }: { icon: LucideIcon; title: string; description: string; badge?: string; highlight?: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      className={cn('min-h-24 flex-row items-center gap-4 rounded-[28px] p-5 active:opacity-90', highlight ? 'bg-secondary' : 'border-2 border-border bg-card')}
    >
      <View className={cn('h-14 w-14 items-center justify-center rounded-2xl', highlight ? 'bg-primary' : 'bg-accent')}>
        <Icon as={icon} size={28} className={highlight ? 'text-primary-foreground' : 'text-foreground'} />
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xl font-extrabold">{title}</Text>
          {badge ? (
            <View className="rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-xs font-bold text-primary-foreground">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-medium">{description}</Text>
      </View>
      <Icon as={ChevronRight} size={24} />
    </Pressable>
  );
}
