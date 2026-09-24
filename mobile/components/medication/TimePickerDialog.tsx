import { useState } from 'react';
import { View } from 'react-native';
import { Chip } from '@/components/common/Chip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: string;
  onConfirm: (hhmm: string) => void;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];

function parse(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

export function toHHmm(hour12: number, minute: number, pm: boolean) {
  const h = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Big-button time picker: tap an hour, a minute and AM/PM. No tiny wheels. */
export function TimePickerDialog({ open, onOpenChange, initial = '08:00', onConfirm }: Props) {
  const [state, setState] = useState(() => parse(initial));
  // Reset to `initial` each time the dialog opens (adjusting state during render, not in an effect).
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = open ? initial : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key !== null) setState(parse(key));
  }

  const preview = toHHmm(state.hour12, state.minute, state.pm);
  const label = `${state.hour12}:${String(state.minute).padStart(2, '0')} ${state.pm ? 'PM' : 'AM'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94%] gap-4">
        <DialogHeader>
          <DialogTitle>Choose a time</DialogTitle>
        </DialogHeader>
        <View className="items-center rounded-2xl bg-accent py-3" accessibilityLiveRegion="polite">
          <Text className="text-4xl font-extrabold text-accent-foreground">{label}</Text>
        </View>

        <View className="flex-row gap-2" role="radiogroup" accessibilityLabel="Morning or afternoon">
          <Chip label="AM" selected={!state.pm} onPress={() => setState((s) => ({ ...s, pm: false }))} className="flex-1" />
          <Chip label="PM" selected={state.pm} onPress={() => setState((s) => ({ ...s, pm: true }))} className="flex-1" />
        </View>

        <View>
          <Text className="mb-2 font-bold text-muted-foreground">Hour</Text>
          <View className="flex-row flex-wrap gap-2" role="radiogroup" accessibilityLabel="Hour">
            {HOURS.map((h) => (
              <HourCell key={h} value={h} selected={state.hour12 === h} onPress={() => setState((s) => ({ ...s, hour12: h }))} />
            ))}
          </View>
        </View>

        <View>
          <Text className="mb-2 font-bold text-muted-foreground">Minutes</Text>
          <View className="flex-row gap-2" role="radiogroup" accessibilityLabel="Minutes">
            {MINUTES.map((m) => (
              <Chip key={m} label={`:${String(m).padStart(2, '0')}`} selected={state.minute === m} onPress={() => setState((s) => ({ ...s, minute: m }))} className="flex-1 px-2" />
            ))}
          </View>
        </View>

        <DialogFooter className="gap-3">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text>Cancel</Text>
          </Button>
          <Button
            onPress={() => {
              onConfirm(preview);
              onOpenChange(false);
            }}
          >
            <Text>Use {label}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HourCell({ value, selected, onPress }: { value: number; selected: boolean; onPress: () => void }) {
  return (
    <Button
      variant={selected ? 'default' : 'outline'}
      role="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${value} o'clock`}
      onPress={onPress}
      className={cn('h-14 w-[22%] rounded-2xl px-0', !selected && 'border-2')}
    >
      <Text className="text-xl font-extrabold">{value}</Text>
    </Button>
  );
}
