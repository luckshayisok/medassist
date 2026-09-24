import Svg, { ClipPath, Defs, G, Line, Path, Rect, Circle } from 'react-native-svg';

/** The MedAssist mark (same drawing as the app icon): a two-tone capsule with a "taken" check. */
export function BrandMark({ size = 64, rounded = 18 }: { size?: number; rounded?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="MedAssist" role="img">
      <Defs>
        <ClipPath id="bm-cap">
          <Rect x={-300} y={-125} width={600} height={250} rx={125} />
        </ClipPath>
      </Defs>
      <Rect width={1024} height={1024} rx={(rounded / size) * 1024} fill="#1F1D1B" />
      <G transform="translate(512 512) scale(0.92) translate(-512 -512)">
        <G transform="translate(482 482) rotate(-40)">
          <G clipPath="url(#bm-cap)">
            <Rect x={-300} y={-125} width={300} height={250} fill="#F6F0E4" />
            <Rect x={0} y={-125} width={300} height={250} fill="#F5A9CB" />
            <Rect x={-300} y={-125} width={600} height={70} fill="#ffffff" opacity={0.18} />
          </G>
          <Line x1={0} y1={-125} x2={0} y2={125} stroke="#1F1D1B" strokeWidth={10} opacity={0.35} />
        </G>
        <Circle cx={712} cy={712} r={150} fill="#F4D66F" stroke="#1F1D1B" strokeWidth={28} />
        <Path d="M640 714 l50 50 l96 -104" fill="none" stroke="#1F1D1B" strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}
