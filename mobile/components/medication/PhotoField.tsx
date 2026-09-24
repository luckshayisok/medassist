import { Camera, ImagePlus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { PhotoChange } from '@/hooks/useMedications';
import { pickPhoto, takePhoto, type PhotoResult } from '@/services/camera/photo';
import type { DoseUnit } from '@/types/medication';
import { MedAvatar } from './MedAvatar';

interface Props {
  medId: string;
  name: string;
  unit: DoseUnit;
  existingUrl: string | null;
  value: PhotoChange;
  onChange: (p: PhotoChange) => void;
}

/** Mustard highlight card: take / choose / replace / remove the medicine's photo. */
export function PhotoField({ medId, name, unit, existingUrl, value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const shownUrl = value.kind === 'remove' ? null : existingUrl;
  const preview = value.kind === 'set' ? value.uri : null;
  const hasPhoto = !!(preview || shownUrl);

  const run = async (fn: () => Promise<PhotoResult>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) onChange({ kind: 'set', uri: r.uri });
      else if (r.reason === 'denied') {
        Alert.alert('Camera permission needed', 'To take a photo of your medicine, allow camera access in Settings.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="overflow-hidden rounded-[28px] bg-secondary p-5">
      <Text importantForAccessibility="no" style={{ position: 'absolute', right: 14, top: 2, fontSize: 60, opacity: 0.16 }}>
        ✚
      </Text>
      <View className="flex-row items-center gap-4">
        <MedAvatar medication={{ id: medId, name: name || 'Medicine', unit, imageUrl: shownUrl, version: 0 }} previewUri={preview} size="md" />
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-secondary-foreground">{hasPhoto ? 'Photo added' : 'Add a photo'}</Text>
          <Text className="text-secondary-foreground">Shown on every reminder, so you pick the right one.</Text>
        </View>
      </View>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {Platform.OS !== 'web' ? (
          <Button size="sm" className="px-5" disabled={busy} onPress={() => run(takePhoto)}>
            <Icon as={Camera} size={18} className="text-primary-foreground" />
            <Text className="text-sm">{hasPhoto ? 'Retake' : 'Take photo'}</Text>
          </Button>
        ) : null}
        <Button size="sm" className="px-5" disabled={busy} onPress={() => run(pickPhoto)}>
          <Icon as={ImagePlus} size={18} className="text-primary-foreground" />
          <Text className="text-sm">{hasPhoto ? 'Choose another' : 'From photos'}</Text>
        </Button>
        {hasPhoto ? (
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => onChange(existingUrl ? { kind: 'remove' } : { kind: 'keep' })}>
            <Icon as={Trash2} size={18} className="text-secondary-foreground" />
            <Text className="text-sm text-secondary-foreground underline">Remove</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
