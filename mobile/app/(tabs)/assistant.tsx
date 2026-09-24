import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, MessageCircleQuestion, SendHorizontal, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AssistantMessage, UserBubble } from '@/components/assistant/AssistantMessage';
import { FormAlert } from '@/components/common/FormAlert';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useAppearance';
import { useMedicationList } from '@/hooks/useMedications';
import { FONT } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { assistantApi, type ChatMessage } from '@/services/api/assistant';
import { useAuth } from '@/store/authStore';

export default function AssistantScreen() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const c = useThemeColors();
  const meds = useMedicationList();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const key = ['assistant', user?.id];

  const history = useQuery({ queryKey: key, queryFn: assistantApi.history, enabled: user?.role === 'PATIENT' });
  const messages = history.data?.messages ?? [];
  const conversationId = history.data?.conversationId ?? null;

  const send = useMutation({
    mutationFn: (text: string) => assistantApi.send(text, conversationId),
    onMutate: (text) => {
      setError(undefined);
      // Show the question immediately.
      const optimistic: ChatMessage = { id: `local-${Date.now()}`, conversationId: conversationId ?? '', role: 'user', text, sections: [], followUps: [], createdAt: new Date().toISOString() };
      qc.setQueryData(key, { conversationId, messages: [...messages, optimistic] });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }).then(() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)),
    onError: (e, text) => {
      setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
      // Give the question back so it doesn't have to be typed again.
      setDraft((d) => d || text);
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const clear = useMutation({ mutationFn: assistantApi.clear, onSuccess: () => qc.setQueryData(key, { conversationId: null, messages: [] }) });

  const suggestions = useMemo(() => {
    const first = meds[0]?.name;
    return [first ? `What is ${first} for?` : 'What can you help me with?', 'What should I do if I miss a dose?', 'What should I avoid with my medicines?', 'When should I take each medicine?'];
  }, [meds]);

  const submit = (text = draft) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    setDraft('');
    send.mutate(t);
  };

  if (user?.role === 'CAREGIVER') {
    return (
      <SafeAreaView className="flex-1 bg-background p-4" edges={['top']}>
        <View className="items-center gap-3 rounded-[28px] bg-card p-6">
          <Icon as={HeartHandshake} size={40} />
          <Text className="text-center text-2xl font-extrabold">Coming soon for caregivers</Text>
          <Text className="text-center text-muted-foreground">You'll be able to ask about the medicines of the person you care for.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
          <Text role="heading" className="text-2xl font-extrabold tracking-tight">
            Ask about your medicines
          </Text>
          {messages.length ? (
            <Pressable role="button" accessibilityLabel="Clear conversation" onPress={() => clear.mutate()} className="h-11 w-11 items-center justify-center rounded-full bg-card">
              <Icon as={Trash2} size={20} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-4 px-4 pb-4 pt-2" keyboardShouldPersistTaps="handled">
          {history.isLoading ? <ActivityIndicator className="mt-10" /> : null}
          {!history.isLoading && messages.length === 0 ? (
            <View className="gap-4">
              <View className="overflow-hidden rounded-[28px] bg-secondary p-5">
                <Text importantForAccessibility="no" style={{ position: 'absolute', right: 14, top: -4, fontSize: 60, opacity: 0.16 }}>
                  ✚
                </Text>
                <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-primary">
                  <Icon as={MessageCircleQuestion} size={26} className="text-primary-foreground" />
                </View>
                <Text className="text-xl font-extrabold text-secondary-foreground">Hi{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! Ask me about your medicines.</Text>
                <Text className="mt-1 font-medium text-secondary-foreground">
                  I explain what your prescription says in simple words. I'm not a doctor and can't change your treatment.
                </Text>
              </View>
              <Text className="font-bold text-muted-foreground">Try asking</Text>
              {suggestions.map((s) => (
                <Pressable key={s} role="button" onPress={() => submit(s)} className="min-h-14 justify-center rounded-3xl border-2 border-input bg-card px-4 active:bg-accent">
                  <Text className="font-semibold">{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.text} />
            ) : (
              <AssistantMessage key={m.id} message={m} onFollowUp={submit} showFollowUps={m.id === lastAssistant?.id && !send.isPending} />
            ),
          )}
          {send.isPending ? <ThinkingBubble /> : null}
          <FormAlert message={error} />
        </ScrollView>

        {/* Input sits above the floating tab bar */}
        <View className="gap-2 px-4 pt-2" style={{ paddingBottom: 104 }}>
          <View className="flex-row items-end gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type your question…"
              placeholderTextColor={c.mutedForeground}
              accessibilityLabel="Your question"
              multiline
              maxLength={1000}
              style={{ fontFamily: FONT.medium, color: c.foreground, fontSize: 17 }}
              className="max-h-32 min-h-14 flex-1 rounded-[28px] border-2 border-input bg-card px-5 py-3.5"
              onSubmitEditing={() => submit()}
            />
            <Pressable
              role="button"
              accessibilityLabel="Send"
              disabled={!draft.trim() || send.isPending}
              onPress={() => submit()}
              className={cn('h-14 w-14 items-center justify-center rounded-full bg-primary', (!draft.trim() || send.isPending) && 'opacity-40')}
            >
              <Icon as={SendHorizontal} size={24} className="text-primary-foreground" />
            </Pressable>
          </View>
          <Text className="text-center text-xs text-muted-foreground">Not medical advice. For emergencies call 112.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Thinking…", then an honest note if the free AI service is slow. */
function ThinkingBubble() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View className="max-w-[85%] flex-row items-center gap-3 self-start rounded-3xl bg-card px-4 py-3" accessibilityLiveRegion="polite">
      <ActivityIndicator />
      <View className="flex-1">
        <Text className="font-semibold text-muted-foreground">Thinking…</Text>
        {slow ? <Text className="text-sm text-muted-foreground">Still working on it. This can take up to a minute.</Text> : null}
      </View>
    </View>
  );
}
