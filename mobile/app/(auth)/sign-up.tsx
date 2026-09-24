import { router } from 'expo-router';
import { Eye, EyeOff, HeartHandshake, UserPlus, UserRound } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { ChoiceCard } from '@/components/common/ChoiceCard';
import { FormAlert } from '@/components/common/FormAlert';
import { FormField } from '@/components/common/FormField';
import { Screen } from '@/components/common/Screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/store/authStore';
import { useSettings, type UserRole } from '@/store/settingsStore';
import { toFormErrors, type FormErrors } from '@/utils/errors';

export default function SignUpScreen() {
  const signUp = useAuth((s) => s.signUp);
  const onboardingRole = useSettings((s) => s.role);
  const [role, setRole] = useState<UserRole>(onboardingRole ?? 'PATIENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({ fields: {} });
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const validate = (): FormErrors['fields'] => {
    const f: FormErrors['fields'] = {};
    if (!name.trim()) f.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) f.email = 'Enter a valid email address';
    if (password.length < 8) f.password = 'Password must be at least 8 characters';
    return f;
  };

  const submit = async () => {
    const fields = validate();
    if (Object.keys(fields).length) {
      setErrors({ fields });
      return;
    }
    setBusy(true);
    setErrors({ fields: {} });
    try {
      await signUp({ name: name.trim(), email: email.trim(), password, role });
    } catch (e) {
      setErrors(toFormErrors(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View className="gap-2 pt-4">
        <Text role="heading" className="text-3xl font-extrabold tracking-tight">
          Create your account
        </Text>
        <Text className="text-lg text-muted-foreground">It only takes a minute.</Text>
      </View>

      <FormAlert message={errors.form} />

      <View className="gap-2">
        <Label>I am</Label>
        <View role="radiogroup" className="gap-3">
          <ChoiceCard icon={UserRound} title="The patient" selected={role === 'PATIENT'} onPress={() => setRole('PATIENT')} />
          <ChoiceCard icon={HeartHandshake} title="A caregiver" selected={role === 'CAREGIVER'} onPress={() => setRole('CAREGIVER')} />
        </View>
      </View>

      <FormField
        label="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        error={errors.fields.name}
      />
      <FormField
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.fields.email}
      />
      <View className="gap-2">
        <FormField
          ref={passwordRef}
          label="Password"
          hint="At least 8 characters. A short sentence works well."
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={errors.fields.password}
        />
        <Button variant="ghost" size="sm" className="self-start" onPress={() => setShowPassword((v) => !v)}>
          <Icon as={showPassword ? EyeOff : Eye} size={22} />
          <Text>{showPassword ? 'Hide password' : 'Show password'}</Text>
        </Button>
      </View>

      <Button size="lg" disabled={busy} onPress={submit}>
        <Icon as={UserPlus} size={26} />
        <Text>{busy ? 'Creating account…' : 'Create account'}</Text>
      </Button>

      <Button variant="ghost" onPress={() => router.back()}>
        <Text>I already have an account</Text>
      </Button>
    </Screen>
  );
}
