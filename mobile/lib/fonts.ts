import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

export const FONT_ASSETS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/**
 * Custom fonts on Android can't be selected by fontWeight — each weight is its own family.
 * Map the Tailwind weight class in a (merged) className to the right family.
 */
export function fontFamilyFor(className: string | undefined): string {
  if (!className) return FONT.regular;
  if (/\bfont-(extrabold|black)\b/.test(className)) return FONT.extrabold;
  if (/\bfont-bold\b/.test(className)) return FONT.bold;
  if (/\bfont-semibold\b/.test(className)) return FONT.semibold;
  if (/\bfont-medium\b/.test(className)) return FONT.medium;
  return FONT.regular;
}
