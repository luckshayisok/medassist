import { api } from '@/services/api/client';

export type SectionKind = 'prescription' | 'verified' | 'general' | 'safety' | 'emergency';

export interface ChatSection {
  kind: SectionKind;
  text: string;
  source?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  sections: ChatSection[];
  followUps: string[];
  createdAt: string;
}

export const assistantApi = {
  history: () => api<{ conversationId: string | null; messages: ChatMessage[] }>('/assistant/history'),
  send: (message: string, conversationId?: string | null) =>
    api<{ conversationId: string; message: ChatMessage }>('/assistant/chat', {
      method: 'POST',
      body: conversationId ? { message, conversationId } : { message },
      // The server may try several AI models before answering.
      timeoutMs: 100_000,
    }),
  clear: () => api<void>('/assistant/history', { method: 'DELETE' }),
};
