import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react-native';
import { useSettings } from '@/store/settingsStore';

interface Swatch {
  bg: string;
  fg: string;
}

/**
 * Each medicine gets a stable colour so it's recognisable at a glance ("the purple one").
 * Colour is never the only cue — names and icons are always shown too.
 */
const MED_SWATCHES: { light: Swatch; hc: Swatch }[] = [
  { light: { bg: '#FAD0E3', fg: '#8A1F52' }, hc: { bg: '#330A1E', fg: '#F9A8D4' } }, // blush
  { light: { bg: '#F7E08E', fg: '#6B4E00' }, hc: { bg: '#2E2400', fg: '#FDE68A' } }, // mustard
  { light: { bg: '#DCD3F7', fg: '#4A2F9A' }, hc: { bg: '#1B1033', fg: '#C4B5FD' } }, // lavender
  { light: { bg: '#CDEBD9', fg: '#1E6242' }, hc: { bg: '#07240F', fg: '#86EFAC' } }, // mint
  { light: { bg: '#FBD7C2', fg: '#8A3B12' }, hc: { bg: '#2E1406', fg: '#FDBA74' } }, // peach
  { light: { bg: '#CFE4F5', fg: '#1D4E7A' }, hc: { bg: '#0B1A33', fg: '#93C5FD' } }, // sky
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Keyed by name (lower-cased) so the colour is the same in the add form and after saving. */
export function useMedColor(name: string): Swatch {
  const hc = useSettings((s) => s.highContrast);
  const sw = MED_SWATCHES[hash(name.trim().toLowerCase()) % MED_SWATCHES.length]!;
  return hc ? sw.hc : sw.light;
}

export type Period = 'morning' | 'afternoon' | 'evening' | 'night';

export const PERIODS: Record<Period, { label: string; icon: LucideIcon; light: Swatch; hc: Swatch }> = {
  morning: { label: 'Morning', icon: Sunrise, light: { bg: '#F7E08E', fg: '#6B4E00' }, hc: { bg: '#241800', fg: '#FCD34D' } },
  afternoon: { label: 'Afternoon', icon: Sun, light: { bg: '#FBD7C2', fg: '#8A3B12' }, hc: { bg: '#2A1204', fg: '#FDBA74' } },
  evening: { label: 'Evening', icon: Sunset, light: { bg: '#FAD0E3', fg: '#8A1F52' }, hc: { bg: '#1E0B2E', fg: '#D8B4FE' } },
  night: { label: 'Night', icon: Moon, light: { bg: '#DCD3F7', fg: '#4A2F9A' }, hc: { bg: '#0F1233', fg: '#A5B4FC' } },
};

export function periodOf(hhmmOrDate: string | Date): Period {
  const h = typeof hhmmOrDate === 'string' ? Number(hhmmOrDate.slice(0, 2)) : hhmmOrDate.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function usePeriodColor(p: Period): Swatch {
  const hc = useSettings((s) => s.highContrast);
  return hc ? PERIODS[p].hc : PERIODS[p].light;
}

