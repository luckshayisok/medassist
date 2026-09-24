import * as Speech from 'expo-speech';
import { FileText, Info, Phone, ShieldCheck, Siren, TriangleAlert, Volume2, type LucideIcon } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { EMERGENCY_NUMBER } from '@/constants/app';
import { cn } from '@/lib/utils';
import type { ChatMessage, ChatSection, SectionKind } from '@/services/api/assistant';

const LABEL: Record<SectionKind, { label: (s: ChatSection) => string; icon: LucideIcon; box: string; pill: string }> = {
  prescription: { label: () => 'From your prescription', icon: FileText, box: 'bg-card border border-border', pill: 'bg-blush' },
  verified: { label: (s) => `Verified${s.source ? `: ${s.source}` : ''}`, icon: ShieldCheck, box: 'bg-card border border-border', pill: 'bg-success-soft' },
  general: { label: () => 'General information', icon: Info, box: 'bg-card border border-border', pill: 'bg-muted' },
  safety: { label: () => 'Check with your doctor', icon: TriangleAlert, box: 'bg-warning-soft', pill: 'bg-card' },
  emergency: { label: () => 'Emergency', icon: Siren, box: 'bg-destructive-soft border-2 border-destructive', pill: 'bg-card' },
};

export function UserBubble({ text }: { text: string }) {
  return (
    <View className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-primary px-4 py-3">
      <Text className="text-primary-foreground">{text}</Text>
    </View>
  );
}

export function AssistantMessage({ message, onFollowUp, showFollowUps }: { message: ChatMessage; onFollowUp: (q: string) => void; showFollowUps: boolean }) {
  const speak = () => {
    Speech.stop();
    Speech.speak(message.sections.map((s) => s.text).join(' '), { rate: 0.85 });
  };
  return (
    <View className="max-w-[92%] gap-2 self-start">
      {message.sections.map((s, i) => {
        const m = LABEL[s.kind] ?? LABEL.general;
        return (
          <View key={i} className={cn('gap-2 rounded-3xl p-4', m.box)}>
            <View className={cn('flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1', m.pill)}>
              <Icon as={m.icon} size={14} className={s.kind === 'emergency' ? 'text-destructive' : 'text-foreground'} />
              <Text className={cn('text-xs font-bold', s.kind === 'emergency' && 'text-destructive')}>{m.label(s)}</Text>
            </View>
            <Text className={cn('text-base leading-6', s.kind === 'emergency' && 'font-bold')}>{s.text}</Text>
            {s.kind === 'emergency' ? (
              <Button className="bg-destructive" onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}>
                <Icon as={Phone} size={20} className="text-destructive-foreground" />
                <Text className="text-destructive-foreground">Call {EMERGENCY_NUMBER}</Text>
              </Button>
            ) : null}
          </View>
        );
      })}
      <Pressable role="button" accessibilityLabel="Read this answer aloud" onPress={speak} className="min-h-10 flex-row items-center gap-1.5 self-start px-2">
        <Icon as={Volume2} size={18} className="text-muted-foreground" />
        <Text className="text-sm font-semibold text-muted-foreground">Read aloud</Text>
      </Pressable>
      {showFollowUps && message.followUps.length ? (
        <View className="flex-row flex-wrap gap-2">
          {message.followUps.map((f) => (
            <Pressable key={f} role="button" onPress={() => onFollowUp(f)} className="min-h-11 justify-center rounded-full border-2 border-input bg-card px-4 active:bg-accent">
              <Text className="text-sm font-semibold">{f}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
