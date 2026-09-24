import { HeartHandshake, KeyRound, Share2, Trash2, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingSwitch } from '@/components/accessibility/SettingSwitch';
import { FormAlert } from '@/components/common/FormAlert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useCaregiverActions, useMyCaregivers } from '@/hooks/useCare';
import type { Grantable, LinkedCaregiver } from '@/services/api/care';

const CHOICES: { key: Grantable; title: string; description: string }[] = [
  { key: 'receive_alerts', title: 'Tell them if I miss a dose', description: 'They get a message when a dose is not marked as taken within an hour.' },
  { key: 'manage_medications', title: 'Let them add and change my medicines', description: 'Useful if they help you with your prescriptions.' },
];

const granted = (permissions: string[]) => CHOICES.map((c) => c.key).filter((k) => permissions.includes(k));

/** Patient: who helps me, what they can do, and a code to add someone. */
export default function CaregiversScreen() {
  const insets = useSafeAreaInsets();
  const q = useMyCaregivers();
  const actions = useCaregiverActions();
  const [choice, setChoice] = useState<Grantable[]>(['receive_alerts']);
  const [error, setError] = useState<string>();
  const invite = q.data?.invite;

  const run = async (fn: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 pt-3" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View className="overflow-hidden rounded-[28px] bg-secondary p-5">
        <Text importantForAccessibility="no" style={{ position: 'absolute', right: 16, top: -2, fontSize: 60, opacity: 0.16 }}>
          ✚
        </Text>
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-primary">
          <Icon as={HeartHandshake} size={26} className="text-primary-foreground" />
        </View>
        <Text className="text-xl font-extrabold text-secondary-foreground">Let family help you</Text>
        <Text className="mt-1 font-medium text-secondary-foreground">
          A son, daughter or carer can see your medicines and whether you took them, on their own phone. You choose what else they can do, and you can remove them any time.
        </Text>
      </View>

      <FormAlert message={error} />

      {q.isLoading ? <ActivityIndicator size="large" /> : null}

      {(q.data?.caregivers ?? []).length ? (
        <View className="gap-3">
          <Text role="heading" className="text-xl font-extrabold">
            People who help you
          </Text>
          {q.data!.caregivers.map((c) => (
            <CaregiverCard key={c.id} caregiver={c} onError={setError} />
          ))}
        </View>
      ) : null}

      <View className="gap-3 rounded-[28px] border border-border bg-card p-5">
        <Text role="heading" className="text-xl font-extrabold">
          {invite ? 'Your code' : 'Add someone'}
        </Text>
        {invite ? (
          <>
            <Text className="text-muted-foreground">Tell them this code. They enter it in MedAssist (signed up as a caregiver).</Text>
            <View className="items-center rounded-3xl bg-blush py-5">
              <Text accessibilityLabel={`Code ${invite.code.split('').join(' ')}`} className="text-4xl font-extrabold tracking-[6px] text-blush-foreground">
                {invite.code}
              </Text>
              <Text className="mt-1 font-semibold text-blush-foreground opacity-80">
                Works until {new Date(invite.expiresAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
            <Button
              size="lg"
              onPress={() =>
                void Share.share({
                  message: `Join me on MedAssist to help with my medicines. Open the app, sign up as a caregiver, and enter this code: ${invite.code}`,
                }).catch(() => {})
              }
            >
              <Icon as={Share2} size={22} className="text-primary-foreground" />
              <Text>Send the code</Text>
            </Button>
            <Button variant="ghost" disabled={actions.cancelInvite.isPending} onPress={() => run(() => actions.cancelInvite.mutateAsync())}>
              <Icon as={Trash2} size={20} className="text-destructive" />
              <Text className="text-destructive">Cancel this code</Text>
            </Button>
          </>
        ) : (
          <>
            <Text className="text-muted-foreground">They will always see your medicines and whether you took them. Also:</Text>
            {CHOICES.map((c) => (
              <SettingSwitch
                key={c.key}
                title={c.title}
                description={c.description}
                checked={choice.includes(c.key)}
                onCheckedChange={(on) => setChoice((prev) => (on ? [...prev, c.key] : prev.filter((k) => k !== c.key)))}
              />
            ))}
            <Button size="lg" disabled={actions.invite.isPending} onPress={() => run(() => actions.invite.mutateAsync(choice))}>
              <Icon as={KeyRound} size={22} className="text-primary-foreground" />
              <Text>{actions.invite.isPending ? 'Creating…' : 'Create a code'}</Text>
            </Button>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function CaregiverCard({ caregiver: c, onError }: { caregiver: LinkedCaregiver; onError: (m?: string) => void }) {
  const actions = useCaregiverActions();
  const current = granted(c.permissions);
  const first = c.name.split(' ')[0];

  const toggle = async (key: Grantable, on: boolean) => {
    onError(undefined);
    try {
      await actions.setPermissions.mutateAsync({ id: c.id, permissions: on ? [...current, key] : current.filter((k) => k !== key) });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <View className="gap-1 rounded-[28px] border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-blush">
          <Text className="text-lg font-extrabold text-blush-foreground">{first.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg font-extrabold">{c.name}</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {c.email}
          </Text>
        </View>
      </View>
      <Separator className="my-2" />
      {CHOICES.map((ch) => (
        <SettingSwitch key={ch.key} title={ch.title} checked={current.includes(ch.key)} onCheckedChange={(on) => void toggle(ch.key, on)} />
      ))}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="self-start">
            <Icon as={UserMinus} size={20} className="text-destructive" />
            <Text className="text-destructive">Remove {first}</Text>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {first}?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer see your medicines or get alerts. You can add them again later with a new code.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Keep</Text>
            </AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onPress={() => void actions.remove.mutateAsync(c.id).catch((e: Error) => onError(e.message))}>
              <Text className="text-destructive-foreground">Remove</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
