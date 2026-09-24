import { router, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { House, MessageCircleQuestion, Pill, Plus, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useSettings } from '@/store/settingsStore';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const META: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: House },
  medicines: { label: 'Medicines', icon: Pill },
  assistant: { label: 'Ask', icon: MessageCircleQuestion },
  profile: { label: 'Profile', icon: UserRound },
};

/**
 * Dark floating bar with a raised blush "+" (add medicine) in the middle.
 * Every tab keeps a text label — icons alone are hard for many older users.
 */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const hc = useSettings((s) => s.highContrast);
  const barBg = hc ? '#000' : '#1F1D1B';
  const inactive = hc ? '#FFFFFF' : '#B9B2A6';
  const active = c.blush;

  // Schedule is reached from Home ("Today's plan"); keep the bar to 2 + (+) + 2 like the design.
  const tabs = state.routes.flatMap((route, index) => {
    if (!META[route.name]) return [];
    const meta = META[route.name]!;
    const focused = state.index === index;
    const Icon = meta.icon;
    return (
      <Pressable
        key={route.key}
        role="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={`${meta.label} tab`}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        className="min-h-14 flex-1 items-center justify-center gap-1"
      >
        <Icon size={24} color={focused ? active : inactive} strokeWidth={focused ? 2.6 : 2} />
        <Text numberOfLines={1} style={{ color: focused ? active : inactive, fontSize: 11 }} className={focused ? 'font-bold' : 'font-medium'}>
          {meta.label}
        </Text>
      </Pressable>
    );
  });

  // Put the add button in the middle of the five tabs.
  const mid = Math.ceil(tabs.length / 2);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 10) }}>
      <View
        style={{ backgroundColor: barBg, borderRadius: 28, borderWidth: hc ? 2 : 0, borderColor: '#FFE14D' }}
        className="flex-row items-center px-1 py-2 shadow-lg shadow-black/30"
      >
        {tabs.slice(0, mid)}
        <View className="w-16 items-center">
          <Pressable
            role="button"
            accessibilityLabel="Add a medicine"
            onPress={() => router.push('/medication/new')}
            style={{ backgroundColor: c.blush, borderColor: c.background, marginTop: -34 }}
            className="h-16 w-16 items-center justify-center rounded-full border-4 active:opacity-80"
          >
            <Plus size={30} color="#1F1D1B" strokeWidth={2.6} />
          </Pressable>
        </View>
        {tabs.slice(mid)}
      </View>
    </View>
  );
}

/** Space screens must leave at the bottom so content isn't hidden behind the floating bar. */
export const TAB_BAR_SPACE = 110;
