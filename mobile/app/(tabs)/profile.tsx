import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ChevronRight, HeartHandshake, LogOut, Trash2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SettingSwitch } from '@/components/accessibility/SettingSwitch';
import { TextSizePicker } from '@/components/accessibility/TextSizePicker';
import { BrandMark } from '@/components/common/BrandMark';
import { EmergencyButton } from '@/components/common/EmergencyButton';
import { RemindersCard } from '@/components/reminder/RemindersCard';
import { FormField } from '@/components/common/FormField';
import { Screen } from '@/components/common/Screen';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { APP_NAME, DISCLAIMER } from '@/constants/app';
import { ApiError } from '@/services/api/client';
import { useAuth } from '@/store/authStore';
import { useSettings } from '@/store/settingsStore';

export default function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const { highContrast, setHighContrast, readAloud, setReadAloud } = useSettings();

  return (
    <Screen tab>
      <Text role="heading" className="text-3xl font-extrabold tracking-tight">
        Profile
      </Text>

      {user ? (
        <Card>
          <CardContent className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary">
              <Icon as={UserRound} size={30} className="text-primary-foreground" />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-xl font-bold">{user.name}</Text>
              <Text className="text-muted-foreground">{user.email}</Text>
              <Badge variant="secondary" className="self-start">
                <Text>{user.role === 'PATIENT' ? 'Patient' : 'Caregiver'}</Text>
              </Badge>
            </View>
          </CardContent>
        </Card>
      ) : null}

      <RemindersCard />

      {user ? (
        <Pressable
          role="button"
          onPress={() => router.push(user.role === 'PATIENT' ? '/caregivers' : '/care/link')}
          className="min-h-20 flex-row items-center gap-3 rounded-[28px] bg-blush p-4 active:opacity-80"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-card">
            <Icon as={HeartHandshake} size={24} className="text-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-blush-foreground">{user.role === 'PATIENT' ? 'Family & caregivers' : 'Link a person'}</Text>
            <Text className="font-medium text-blush-foreground opacity-80">
              {user.role === 'PATIENT' ? 'Let someone you trust keep an eye on your medicines' : 'Enter the code they give you'}
            </Text>
          </View>
          <Icon as={ChevronRight} size={22} className="text-blush-foreground" />
        </Pressable>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Text size</CardTitle>
          <CardDescription>Changes the size of all text in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <TextSizePicker />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="gap-1">
          <SettingSwitch
            title="High contrast"
            description="Bright text on a black background"
            checked={highContrast}
            onCheckedChange={setHighContrast}
          />
          <Separator />
          <SettingSwitch
            title="Read aloud button"
            description="Show a button that reads medicine instructions out loud"
            checked={readAloud}
            onCheckedChange={setReadAloud}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency</CardTitle>
          <CardDescription>MedAssist is not an emergency service.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmergencyButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <Icon as={LogOut} size={24} />
                <Text>Sign out</Text>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>You will need your email and password to sign in again.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Text>Stay signed in</Text>
                </AlertDialogCancel>
                <AlertDialogAction onPress={() => void signOut()}>
                  <Text>Sign out</Text>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <DeleteAccountButton />
        </CardContent>
      </Card>

      <Text className="text-muted-foreground">{DISCLAIMER}</Text>

      <View className="flex-row items-center justify-center gap-3 pb-2 pt-2">
        <BrandMark size={32} rounded={9} />
        <Text className="font-bold text-muted-foreground">
          {APP_NAME} · version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </Screen>
  );
}

function DeleteAccountButton() {
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteAccount(password);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" onPress={() => setOpen(true)}>
        <Icon as={Trash2} size={24} className="text-destructive" />
        <Text className="text-destructive">Delete my account</Text>
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPassword(''); setError(undefined); } }}>
        <DialogContent className="w-[92%]">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account, medicines, history and prescriptions. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <FormField
            label="Enter your password to confirm"
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            error={error}
          />
          <DialogFooter className="gap-3">
            <Button variant="outline" onPress={() => setOpen(false)}>
              <Text>Keep my account</Text>
            </Button>
            <Button variant="destructive" disabled={!password || busy} onPress={submit}>
              <Text>{busy ? 'Deleting…' : 'Delete forever'}</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
