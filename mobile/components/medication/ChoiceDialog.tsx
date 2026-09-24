import { View } from 'react-native';
import { ChoiceCard } from '@/components/common/ChoiceCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface Choice<T> {
  value: T;
  label: string;
  description?: string;
}

/** A dialog of big radio cards — used for "course length", "start date", etc. */
export function ChoiceDialog<T>({
  open,
  onOpenChange,
  title,
  choices,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  choices: Choice<T>[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90%] w-[92%]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <View role="radiogroup" className="gap-2">
          {choices.map((c) => (
            <ChoiceCard
              key={String(c.value)}
              title={c.label}
              description={c.description}
              selected={c.value === selected}
              onPress={() => {
                onSelect(c.value);
                onOpenChange(false);
              }}
            />
          ))}
        </View>
      </DialogContent>
    </Dialog>
  );
}
