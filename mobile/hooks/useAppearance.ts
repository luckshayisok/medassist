import { colorScheme, rem } from 'nativewind';
import { useEffect } from 'react';
import { NAV_THEME, REM, THEME } from '@/lib/theme';
import { useSettings } from '@/store/settingsStore';

/** Push the user's text-size and contrast settings into NativeWind. Call once, in the root layout. */
export function useApplyAppearance() {
  const textSize = useSettings((s) => s.textSize);
  const highContrast = useSettings((s) => s.highContrast);

  useEffect(() => {
    rem.set(REM[textSize]);
  }, [textSize]);

  useEffect(() => {
    colorScheme.set(highContrast ? 'dark' : 'light');
  }, [highContrast]);

  return { navTheme: NAV_THEME[highContrast ? 'highContrast' : 'light'], highContrast };
}

/** Resolved colors for APIs that don't accept className (tab bar, Switch track, etc.). */
export function useThemeColors() {
  const highContrast = useSettings((s) => s.highContrast);
  return highContrast ? THEME.highContrast : THEME.light;
}
