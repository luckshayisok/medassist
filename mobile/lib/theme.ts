import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/** Mirrors global.css so non-className APIs (navigation, tab bar, switches) use the same tokens. */
export const THEME = {
  light: {
    background: 'hsl(40 45% 94%)',
    foreground: 'hsl(30 8% 12%)',
    card: 'hsl(42 60% 98%)',
    primary: 'hsl(30 8% 12%)',
    primaryForeground: 'hsl(40 45% 96%)',
    muted: 'hsl(38 35% 89%)',
    mutedForeground: 'hsl(30 8% 34%)',
    accent: 'hsl(330 85% 91%)',
    blush: 'hsl(330 78% 82%)',
    secondary: 'hsl(45 88% 72%)',
    destructive: 'hsl(0 65% 42%)',
    success: 'hsl(145 55% 27%)',
    warning: 'hsl(28 85% 30%)',
    border: 'hsl(36 25% 82%)',
    input: 'hsl(335 45% 80%)',
  },
  highContrast: {
    background: 'hsl(0 0% 0%)',
    foreground: 'hsl(0 0% 100%)',
    card: 'hsl(0 0% 4%)',
    primary: 'hsl(51 100% 62%)',
    primaryForeground: 'hsl(0 0% 0%)',
    muted: 'hsl(0 0% 12%)',
    mutedForeground: 'hsl(0 0% 90%)',
    accent: 'hsl(51 60% 14%)',
    blush: 'hsl(51 100% 62%)',
    secondary: 'hsl(51 100% 62%)',
    destructive: 'hsl(0 100% 72%)',
    success: 'hsl(140 100% 65%)',
    warning: 'hsl(38 100% 66%)',
    border: 'hsl(0 0% 75%)',
    input: 'hsl(0 0% 85%)',
  },
};

export type ThemeColors = (typeof THEME)['light'];

export const NAV_THEME: Record<'light' | 'highContrast', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  highContrast: {
    ...DarkTheme,
    colors: {
      background: THEME.highContrast.background,
      border: THEME.highContrast.border,
      card: THEME.highContrast.card,
      notification: THEME.highContrast.destructive,
      primary: THEME.highContrast.primary,
      text: THEME.highContrast.foreground,
    },
  },
};

export type TextSize = 'standard' | 'large' | 'xl';

/**
 * Root font size per text-size setting. All Tailwind sizes and spacing are rem-based, so the whole
 * UI (text, padding, button heights) scales together. Standard is normal phone text size.
 */
export const REM: Record<TextSize, number> = { standard: 15, large: 18, xl: 21 };
