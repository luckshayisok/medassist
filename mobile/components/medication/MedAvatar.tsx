import { Image } from 'expo-image';
import { Bandage, Droplet, Package, Pill, Soup, Syringe, Wind, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useMedColor } from '@/lib/palette';
import { resolveFileUrl } from '@/services/api/client';
import type { DoseUnit, Medication } from '@/types/medication';

const UNIT_ICON: Record<DoseUnit, LucideIcon> = {
  tablet: Pill,
  capsule: Pill,
  ml: Droplet,
  drop: Droplet,
  spoon: Soup,
  puff: Wind,
  unit: Syringe,
  injection: Syringe,
  patch: Bandage,
  sachet: Package,
};

const SIZES = { sm: 52, md: 64, lg: 88, xl: 148 } as const;

type Props = {
  medication: Pick<Medication, 'id' | 'name' | 'unit' | 'imageUrl' | 'version'>;
  size?: keyof typeof SIZES;
  /** Local preview (unsaved photo) overrides the stored one. */
  previewUri?: string | null;
};

/** The medicine's photo, or a colour-coded icon tile until a photo is added. */
export function MedAvatar({ medication, size = 'md', previewUri }: Props) {
  const color = useMedColor(medication.name);
  const px = SIZES[size];
  const radius = px * 0.28;
  const uri = previewUri ?? resolveFileUrl(medication.imageUrl);

  if (uri) {
    return (
      <Image
        source={{ uri, cacheKey: previewUri ? undefined : `${medication.id}-${medication.version}` }}
        cachePolicy="disk"
        contentFit="cover"
        transition={150}
        style={{ width: px, height: px, borderRadius: radius, borderWidth: 2, borderColor: color.bg }}
        accessibilityLabel={`Photo of ${medication.name}`}
      />
    );
  }
  const Icon = UNIT_ICON[medication.unit] ?? Pill;
  return (
    <View
      accessible
      accessibilityLabel={`${medication.name} (no photo yet)`}
      style={{ width: px, height: px, borderRadius: radius, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={px * 0.46} color={color.fg} strokeWidth={2.2} />
    </View>
  );
}
