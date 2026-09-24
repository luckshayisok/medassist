import { router } from 'expo-router';
import { CircleCheck, Link2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { FormAlert } from '@/components/common/FormAlert';
import { Screen } from '@/components/common/Screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useAcceptInvite } from '@/hooks/useCare';
import { FONT } from '@/lib/fonts';

/** "abcd2345" → "ABCD-2345" while typing. */
export function formatCodeInput(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export default function LinkPersonScreen() {
  const c = useThemeColors();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const accept = useAcceptInvite();
  const ready = code.replace('-', '').length === 8;

  const submit = async () => {
    setError(undefined);
    try {
      await accept.mutateAsync(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link. Please try again.');
    }
  };

  if (accept.data) {
    const { patient, permissions } = accept.data;
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View className="flex-1 justify-center gap-5">
          <View className="items-center gap-3 rounded-[28px] bg-success-soft p-6">
            <Icon as={CircleCheck} size={48} className="text-success" />
            <Text className="text-center text-2xl font-extrabold">You're now linked with {patient.name}</Text>
            <Text className="text-center font-medium">
              You can see their medicines and whether they took them.
              {permissions.includes('receive_alerts') ? ' You will get a message if a dose is missed.' : ''}
              {permissions.includes('manage_medications') ? ' You can also add and change their medicines.' : ''}
            </Text>
          </View>
          <Button size="lg" onPress={() => router.replace({ pathname: '/care/[patientId]', params: { patientId: patient.id } })}>
            <Text>See how {patient.name.split(' ')[0]} is doing</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View className="flex-row items-center justify-between">
        <Pressable role="button" accessibilityLabel="Close" onPress={() => router.back()} className="h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground">
          <Icon as={X} size={22} />
        </Pressable>
        <Text role="heading" className="text-lg font-bold">
          Link a person
        </Text>
        <View className="h-12 w-12" />
      </View>

      <View className="gap-2">
        <Text className="text-3xl font-extrabold tracking-tight">Enter their code</Text>
        <Text className="text-muted-foreground">
          On their phone: MedAssist → Profile → Family & caregivers → “Create a code”. The code works for 2 days.
        </Text>
      </View>

      <TextInput
        value={code}
        onChangeText={(v) => setCode(formatCodeInput(v))}
        placeholder="ABCD-2345"
        placeholderTextColor={c.mutedForeground}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        accessibilityLabel="Invite code"
        maxLength={9}
        onSubmitEditing={() => ready && void submit()}
        style={{ fontFamily: FONT.extrabold, color: c.foreground, fontSize: 34, letterSpacing: 4, textAlign: 'center' }}
        className="min-h-20 rounded-[28px] border-2 border-input bg-card px-4"
      />
      <FormAlert message={error} />
      <Button size="lg" disabled={!ready || accept.isPending} onPress={submit}>
        <Icon as={Link2} size={22} className="text-primary-foreground" />
        <Text>{accept.isPending ? 'Linking…' : 'Link'}</Text>
      </Button>
    </Screen>
  );
}
