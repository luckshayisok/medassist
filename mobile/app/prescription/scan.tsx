import { router } from 'expo-router';
import { Camera, CircleCheck, ImagePlus, Lightbulb, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormAlert } from '@/components/common/FormAlert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { prescriptionsApi } from '@/services/api/prescriptions';
import { pickPhoto, PRESCRIPTION, takePhoto, type PhotoResult } from '@/services/camera/photo';

const TIPS = ['Lay the paper flat in good light', 'Fit the whole page in the photo', 'Hold still so the writing is sharp'];

export default function ScanPrescription() {
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const choose = async (fn: () => Promise<PhotoResult>) => {
    setError(undefined);
    const r = await fn();
    if (r.ok) setUri(r.uri);
    else if (r.reason === 'denied') {
      Alert.alert('Camera permission needed', 'To scan a prescription, allow camera access in Settings.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const upload = async () => {
    if (!uri) return;
    setBusy(true);
    setError(undefined);
    try {
      const p = await prescriptionsApi.upload(uri);
      router.replace({ pathname: '/prescription/[id]', params: { id: p.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the photo. Please try again.');
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between px-4">
        <Pressable
          role="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground"
        >
          <Icon as={X} size={22} />
        </Pressable>
        <Text role="heading" className="text-lg font-bold">
          Scan prescription
        </Text>
        <View className="h-12 w-12" />
      </View>

      <ScrollView contentContainerClassName="gap-5 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {uri ? (
          <View className="gap-3">
            <Image source={{ uri }} resizeMode="contain" accessibilityLabel="Your prescription photo" className="h-[420px] w-full rounded-3xl bg-muted" />
            <Text className="text-center text-muted-foreground">Is the writing clear and the whole page visible?</Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-[28px] bg-secondary p-6">
            <Text importantForAccessibility="no" style={{ position: 'absolute', right: 16, top: 0, fontSize: 64, opacity: 0.16 }}>
              ✚
            </Text>
            <Text className="text-2xl font-extrabold text-secondary-foreground">Take a photo of your prescription</Text>
            <Text className="mt-1 font-medium text-secondary-foreground">We'll read the medicines. You check every one before anything is added.</Text>
            <View className="mt-5 gap-2">
              {TIPS.map((t) => (
                <View key={t} className="flex-row items-center gap-3">
                  <Icon as={CircleCheck} size={20} className="text-secondary-foreground" />
                  <Text className="font-semibold text-secondary-foreground">{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <FormAlert message={error} />

        {busy ? (
          <View className="items-center gap-3 rounded-3xl bg-card p-6">
            <ActivityIndicator size="large" />
            <Text className="font-semibold">Uploading…</Text>
          </View>
        ) : uri ? (
          <View className="gap-3">
            <Button size="lg" onPress={upload}>
              <Icon as={CircleCheck} size={24} className="text-primary-foreground" />
              <Text>Use this photo</Text>
            </Button>
            <Button variant="outline" className="border-2" onPress={() => setUri(null)}>
              <Text>Retake</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            {Platform.OS !== 'web' ? (
              <Button size="lg" onPress={() => choose(() => takePhoto(PRESCRIPTION))}>
                <Icon as={Camera} size={24} className="text-primary-foreground" />
                <Text>Take photo</Text>
              </Button>
            ) : null}
            <Button size={Platform.OS === 'web' ? 'lg' : 'default'} variant={Platform.OS === 'web' ? 'default' : 'outline'} className={Platform.OS === 'web' ? '' : 'border-2'} onPress={() => choose(() => pickPhoto(PRESCRIPTION))}>
              <Icon as={ImagePlus} size={22} className={Platform.OS === 'web' ? 'text-primary-foreground' : ''} />
              <Text>Choose from photos</Text>
            </Button>
          </View>
        )}

        <View className="flex-row items-start gap-3 rounded-3xl bg-accent p-4">
          <Icon as={Lightbulb} size={20} className="mt-0.5 text-foreground" />
          <Text className="flex-1 text-sm font-medium">
            Your photo is stored privately and only used to read your medicines. AI can make mistakes, so you'll confirm everything.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
