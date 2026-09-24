import { ArrowRight, Equal, Pill, Soup } from 'lucide-react-native';
import { View } from 'react-native';
import type { FoodTiming } from '@/types/medication';

/** Tiny pictogram: pill→bowl (before), pill=bowl (with), bowl→pill (after). */
export function MealIcon({ timing, color, size = 20 }: { timing: FoodTiming; color: string; size?: number }) {
  const s = size;
  const arrow = <ArrowRight size={s * 0.7} color={color} strokeWidth={2.4} />;
  const pill = <Pill size={s} color={color} strokeWidth={2.2} />;
  const bowl = <Soup size={s} color={color} strokeWidth={2.2} />;
  let parts: React.ReactNode[];
  switch (timing) {
    case 'BEFORE_FOOD':
      parts = [pill, arrow, bowl];
      break;
    case 'WITH_FOOD':
      parts = [pill, <Equal key="eq" size={s * 0.7} color={color} strokeWidth={2.4} />, bowl];
      break;
    case 'AFTER_FOOD':
      parts = [bowl, arrow, pill];
      break;
    case 'EMPTY_STOMACH':
      parts = [pill];
      break;
    default:
      parts = [pill, <Soup key="b" size={s * 0.8} color={color} strokeWidth={1.6} opacity={0.5} />];
  }
  return (
    <View importantForAccessibility="no-hide-descendants" className="flex-row items-center gap-0.5">
      {parts.map((p, i) => (
        <View key={i}>{p}</View>
      ))}
    </View>
  );
}
