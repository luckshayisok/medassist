import { router } from 'expo-router';
import { Camera, Plus } from 'lucide-react-native';
import { View } from 'react-native';
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
          Tell us what you take and when. We'll remind you and show exactly what to take.
        </Text>
        <Button className="self-start px-6" onPress={() => router.push('/medication/new')}>
          <Icon as={Plus} size={22} className="text-primary-foreground" />
          <Text>Add medicine</Text>
        </Button>
      </View>
      <View className="flex-row items-center gap-3 rounded-[28px] border border-dashed border-input bg-card p-4">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-accent">
          <Icon as={Camera} size={22} className="text-foreground" />
        </View>
        <Text className="flex-1 text-muted-foreground">Scanning a prescription is coming soon.</Text>
      </View>
    </View>
  );
}
