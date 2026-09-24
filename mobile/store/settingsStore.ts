import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TextSize } from '@/lib/theme';

export type UserRole = 'PATIENT' | 'CAREGIVER';

// Non-sensitive display preferences only. Auth tokens live in expo-secure-store, never here.
interface SettingsState {
  textSize: TextSize;
  highContrast: boolean;
  readAloud: boolean;
  /** Chosen during onboarding; pre-selects the role on the sign-up screen. */
  role: UserRole | null;
  onboardingComplete: boolean;
  hydrated: boolean;
  setTextSize: (size: TextSize) => void;
  setHighContrast: (on: boolean) => void;
  setReadAloud: (on: boolean) => void;
  setRole: (role: UserRole) => void;
  completeOnboarding: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      textSize: 'standard',
      highContrast: false,
      readAloud: true,
      role: null,
      onboardingComplete: false,
      hydrated: false,
      setTextSize: (textSize) => set({ textSize }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReadAloud: (readAloud) => set({ readAloud }),
      setRole: (role) => set({ role }),
      completeOnboarding: () => set({ onboardingComplete: true }),
    }),
    {
      name: 'medassist-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
    },
  ),
);
