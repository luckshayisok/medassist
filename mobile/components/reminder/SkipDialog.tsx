import { useState } from 'react';
import { View } from 'react-native';
import { ChoiceCard } from '@/components/common/ChoiceCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { SKIP_REASONS } from '@/constants/app';
import type { SkipReason } from '@/types/medication';

interface Props {
  open: boolean;
  medicationName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: SkipReason) => void;
}

export function SkipDialog({ open, medicationName, onOpenChange, onConfirm }: Props) {
  const [reason, setReason] = useState<SkipReason | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90%] w-[92%]">
        <DialogHeader>
          <DialogTitle>Why are you skipping {medicationName}?</DialogTitle>
          <DialogDescription>
            Do not take an extra dose later to make up for this one. If you are unsure, ask your doctor or pharmacist.
          </DialogDescription>
        </DialogHeader>
        <View role="radiogroup" className="gap-2">
          {SKIP_REASONS.map((r) => (
            <ChoiceCard key={r.value} title={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
          ))}
        </View>
        <DialogFooter className="gap-3">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text>Go back</Text>
          </Button>
          <Button variant="destructive" disabled={!reason} onPress={() => reason && onConfirm(reason)}>
            <Text>Skip this dose</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
