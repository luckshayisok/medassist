import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/**
 * The MedAssist mark (same drawing as the app icon): an "M" whose middle stroke is a check mark
 * (dose taken), with a mustard dot for the pill / reminder.
 */
export function BrandMark({ size = 64, rounded = 18 }: { size?: number; rounded?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="MedAssist" role="img">
      <Rect width={1024} height={1024} rx={(rounded / size) * 1024} fill="#1F1D1B" />
      <G transform="translate(512 512) scale(0.78) translate(-512 -512) translate(-28 16)">
        <Path d="M300 720 V370" stroke="#F6F0E4" strokeWidth={116} strokeLinecap="round" />
        <Path d="M744 300 V720" stroke="#F6F0E4" strokeWidth={116} strokeLinecap="round" />
        <Path d="M300 370 L468 628 L744 300" fill="none" stroke="#F5A9CB" strokeWidth={116} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={846} cy={206} r={60} fill="#F4D66F" />
      </G>
    </Svg>
  );
}
