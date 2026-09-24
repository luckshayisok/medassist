import { router } from 'expo-router';
import { ChevronRight, Keyboard, ScanLine } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function EmptyMedicines() {
  return (
    <View className="gap-4">
      <View className="overflow-hidden rounded-[28px] bg-secondary p-6">
        {/* Decorative crosses, like a pharmacy sign */}
        <Text importantForAccessibility="no" style={{ position: 'absolute', right: 18, top: 6, fontSize: 64, opacity: 0.18 }}>
          ✚
        </Text>
        <Text importantForAccessibility="no" style={{ position: 'absolute', right: 70, bottom: -10, fontSize: 44, opacity: 0.14 }}>
          ✚
        </Text>
        <Text className="text-2xl font-extrabold text-secondary-foreground">Add your first medicine</Text>
        <Text className="mb-4 mt-1 font-medium text-secondary-foreground">
          Scan your prescription and we'll read the medicines for you to check. Or type one in.
        </Text>
        <Button className="self-start px-6" onPress={() => router.push('/prescription/scan')}>
          <Icon as={ScanLine} size={22} className="text-primary-foreground" />
          <Text>Scan prescription</Text>
        </Button>
      </View>
      <Pressable
        role="button"
        onPress={() => router.push('/medication/new')}
        className="min-h-16 flex-row items-center gap-3 rounded-[28px] border-2 border-border bg-card p-4 active:bg-accent"
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-accent">
          <Icon as={Keyboard} size={22} className="text-foreground" />
        </View>
        <Text className="flex-1 font-semibold">Type a medicine in myself</Text>
        <Icon as={ChevronRight} size={22} />
      </Pressable>
    </View>
  );
}
