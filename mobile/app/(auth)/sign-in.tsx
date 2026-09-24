import { Link } from 'expo-router';
import { Eye, EyeOff, LogIn } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { FormAlert } from '@/components/common/FormAlert';
import { FormField } from '@/components/common/FormField';
import { Screen } from '@/components/common/Screen';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/common/BrandMark';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/store/authStore';
import { toFormErrors, type FormErrors } from '@/utils/errors';

export default function SignInScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({ fields: {} });
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setErrors({ fields: { ...(!email.trim() && { email: 'Please enter your email' }), ...(!password && { password: 'Please enter your password' }) } });
      return;
    }
    setBusy(true);
    setErrors({ fields: {} });
    try {
      await signIn(email, password); // The router guard moves to Home on success.
    } catch (e) {
      setErrors(toFormErrors(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View className="gap-4 pt-6">
        <BrandMark size={64} rounded={18} />
        <Text role="heading" className="text-3xl font-extrabold tracking-tight">
          Welcome back
        </Text>
        <Text className="text-lg text-muted-foreground">Sign in to see your medicines.</Text>
      </View>

      <FormAlert message={errors.form} />

      <FormField
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
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          textContentType="password"
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
        <Icon as={LogIn} size={26} />
        <Text>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Button>

      <View className="mt-4 items-center gap-2">
        <Text className="text-muted-foreground">New to MedAssist?</Text>
        <Link href="/sign-up" asChild>
          <Button variant="outline" className="w-full">
            <Text>Create an account</Text>
          </Button>
        </Link>
      </View>
    </Screen>
  );
}
