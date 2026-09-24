import '../global.css';
// Defines the background reminder-refresh task at startup (must run at module scope).
import '@/services/notifications/background';

import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { PortalHost } from '@rn-primitives/portal';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useApplyAppearance, useThemeColors } from '@/hooks/useAppearance';
import { FONT, FONT_ASSETS } from '@/lib/fonts';
import { PERSIST_MAX_AGE, queryClient, queryPersister } from '@/lib/queryClient';
import { useAuth } from '@/store/authStore';
import { useSettings } from '@/store/settingsStore';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const { navTheme, highContrast } = useApplyAppearance();
  const c = useThemeColors();
  const hydrated = useSettings((s) => s.hydrated);
  const onboarded = useSettings((s) => s.onboardingComplete);
  const status = useAuth((s) => s.status);

  useEffect(() => {
    useAuth.getState().bootstrap().catch(() => {});
  }, []);

  // If fonts fail to load we still start (system font) — never block the patient.
  const ready = hydrated && status !== 'loading' && (fontsLoaded || !!fontError);
  const signedIn = status === 'signedIn';
  const header = {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.background },
    headerTintColor: c.primary,
    headerTitleStyle: { fontFamily: FONT.bold, fontSize: 20, color: c.foreground },
    headerBackTitle: 'Back',
  } as const;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE }}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={highContrast ? 'light' : 'dark'} />
          {ready ? (
            <Stack screenOptions={{ headerShown: false }}>
              {/* Guards: onboarding → sign in → app. Expo Router redirects when a guard flips. */}
              <Stack.Protected guard={!onboarded}>
                <Stack.Screen name="(onboarding)" />
              </Stack.Protected>
              <Stack.Protected guard={onboarded && !signedIn}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
              <Stack.Protected guard={onboarded && signedIn}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="reminder/[doseKey]" options={{ ...header, title: 'Your medicine', presentation: 'fullScreenModal' }} />
                <Stack.Screen name="medication/new" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="medication/[id]/index" options={{ ...header, title: 'Medicine' }} />
                <Stack.Screen name="history" options={{ ...header, title: 'Your progress' }} />
                <Stack.Screen name="add" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="prescription/scan" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="prescription/[id]/index" options={{ headerShown: false }} />
                <Stack.Screen name="prescription/[id]/[index]" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="medication/[id]/edit" options={{ headerShown: false, presentation: 'modal' }} />
              </Stack.Protected>
            </Stack>
          ) : (
            <View className="flex-1 items-center justify-center bg-background">
              <ActivityIndicator size="large" accessibilityLabel="Loading" />
            </View>
          )}
          <PortalHost />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
