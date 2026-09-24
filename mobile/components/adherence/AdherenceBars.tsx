import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { describeBar, type Bar } from '@/utils/adherenceView';

const PLOT_HEIGHT = 132;

/**
 * Single-series bar chart of % taken. One ink colour (identity never depends on colour), the value
 * printed above every bar (few bars, so direct labels beat a y-axis), and a tap-for-details line
 * in place of a hover tooltip. Every bar is a labelled button for screen readers.
 */
export function AdherenceBars({ bars }: { bars: Bar[] }) {
  const c = useThemeColors();
  const [selected, setSelected] = useState<string | null>(bars.at(-1)?.key ?? null);
  const current = bars.find((b) => b.key === selected) ?? bars.at(-1);

  return (
    <View className="gap-3">
      <View className="flex-row items-end gap-2" style={{ height: PLOT_HEIGHT + 28 }}>
        {bars.map((b) => {
          const isSel = b.key === current?.key;
          const h = b.percent === null ? 0 : Math.max(4, (b.percent / 100) * PLOT_HEIGHT);
          return (
            <Pressable
              key={b.key}
              role="button"
              accessibilityLabel={describeBar(b)}
              accessibilityState={{ selected: isSel }}
              onPress={() => setSelected(b.key)}
              className="flex-1 items-center justify-end"
              style={{ height: PLOT_HEIGHT + 28 }}
              hitSlop={4}
            >
              <Text className="mb-1 text-xs font-bold" style={{ color: c.foreground }}>
                {b.percent === null ? '–' : `${b.percent}%`}
              </Text>
              {b.percent === null ? (
                // Nothing due: a dashed stub on the baseline, not an empty gap.
                <View style={{ height: 6, width: '70%', borderTopWidth: 2, borderStyle: 'dashed', borderColor: c.border }} />
              ) : (
                <View
                  style={{
                    height: h,
                    width: '70%',
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    backgroundColor: isSel ? c.blush : c.foreground,
                    borderWidth: isSel ? 2 : 0,
                    borderColor: c.foreground,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
      {/* Baseline + labels */}
      <View style={{ height: 1, backgroundColor: c.border }} />
      <View className="flex-row gap-2">
        {bars.map((b) => (
          <Text key={b.key} numberOfLines={1} className={b.key === current?.key ? 'flex-1 text-center text-xs font-bold' : 'flex-1 text-center text-xs text-muted-foreground'}>
            {b.label}
          </Text>
        ))}
      </View>
      {current ? (
        <View className="rounded-2xl bg-muted px-4 py-3" accessibilityLiveRegion="polite">
          <Text className="font-semibold">{describeBar(current)}</Text>
        </View>
      ) : null}
    </View>
  );
}
