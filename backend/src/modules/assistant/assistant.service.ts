import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChatMessage } from '../../generated/prisma/client.js';
import { assertPatientAccess } from '../../lib/access.js';
import { HttpError } from '../../lib/errors.js';
import { LlmError, type LlmClient } from '../../lib/gemini.js';
import type { Db } from '../../lib/prisma.js';
import { containsUnsafeAdvice, emergencyReply, isEmergency, SAFE_FALLBACK, type Section } from './safety.js';

type Actor = { userId: string; role: 'PATIENT' | 'CAREGIVER' };

export const ChatSchema = z
  .object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1, 'Type a question').max(1000, 'Please keep questions under 1000 characters'),
  })
  .strict();

const ReplySchema = z.object({
  sections: z
    .array(z.object({ kind: z.enum(['prescription', 'verified', 'general', 'safety']), text: z.string().min(1), source: z.string().nullable().optional() }))
    .min(1),
  followUps: z.array(z.string()).max(3),
});

const REPLY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['prescription', 'verified', 'general', 'safety'] },
          text: { type: 'string' },
          source: { type: ['string', 'null'] },
        },
        required: ['kind', 'text', 'source'],
      },
    },
    followUps: { type: 'array', items: { type: 'string' } },
  },
  required: ['sections', 'followUps'],
};

export const ASSISTANT_RULES = `You are MedAssist's helper for older patients. You explain the patient's existing prescription in simple, kind, short sentences. You are not a doctor or pharmacist.

You must NEVER:
- diagnose, or guess what illness the patient has
- tell them to change a dose, stop a medicine, start a medicine, skip a dose, or take an extra dose to make up for a missed one
- invent or assume prescription details that are not in PATIENT MEDICINES
- present uncertain information as fact

How to answer:
- Split your answer into sections and label each one honestly:
  - "prescription": facts taken directly from PATIENT MEDICINES (their dose, times, food and doctor instructions). Only use this label for what is actually listed there.
  - "verified": only facts from VERIFIED INFORMATION, and put its source name in "source". If there is no VERIFIED INFORMATION, never use this label.
  - "general": widely known, non-personal background (e.g. "Metformin is commonly used to help control blood sugar"). Keep it brief and hedged.
  - "safety": when they should check with their doctor or pharmacist, or anything important about safety.
- Missed dose questions: repeat what their prescription says if it covers it; otherwise tell them to check the medicine leaflet or ask their pharmacist. Never tell them to double up.
- If they ask to change timing, dose or stop: say what the prescription says, then tell them to confirm any change with their doctor or pharmacist.
- If information is missing or unclear, say so plainly and suggest asking the pharmacist.
- If they describe serious symptoms, tell them to call emergency services.
- Reply in the language the patient writes in. Use at most about 120 words in total. No medical jargon.
- followUps: up to 3 short questions the patient might want to ask next, about their own medicines.`;

export class AssistantService {
  constructor(
    private readonly db: Db,
    private readonly llm: LlmClient | null,
    private readonly emergencyNumber = '112',
  ) {}

  private async patientContext(patientId: string): Promise<string> {
    const meds = await this.db.medication.findMany({
      where: { patientId, deletedAt: null },
      include: { schedules: { where: { archivedAt: null }, orderBy: { time: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    if (!meds.length) return 'PATIENT MEDICINES: none added yet.';
    const lines = meds.map((m) => {
      const avoid = (m.avoidInstructions as { text: string; source?: { kind: string; source?: string } }[])
        .map((a) => `${a.text} (${a.source?.kind === 'verified' ? `verified: ${a.source.source}` : 'from prescription'})`)
        .join('; ');
      const days = m.schedules[0]?.frequency === 'SPECIFIC_DAYS' ? ` on days ${m.schedules[0].daysOfWeek.join(',')} (0=Sun)` : m.schedules[0]?.frequency === 'EVERY_N_DAYS' ? ` every ${m.schedules[0].intervalDays} days` : ' every day';
      return [
        `- ${m.name} ${m.dosage}: ${Number(m.doseQuantity)} ${m.unit} at ${m.schedules.map((s) => s.time).join(', ')}${days}`,
        `  food: ${m.foodTiming}${m.foodInstructions ? ` (${m.foodInstructions})` : ''}`,
        m.instructions ? `  how: ${m.instructions}` : '',
        avoid ? `  avoid: ${avoid}` : '',
        m.precautions ? `  precautions: ${m.precautions}` : '',
        m.prescriber ? `  prescribed by: ${m.prescriber}` : '',
        `  course: from ${m.startDate.toISOString().slice(0, 10)}${m.endDate ? ` to ${m.endDate.toISOString().slice(0, 10)}` : ' (ongoing)'}`,
      ]
        .filter(Boolean)
        .join('\n');
    });
    return `PATIENT MEDICINES (verified by the patient or caregiver):\n${lines.join('\n')}`;
  }

  private serialize(m: ChatMessage) {
    const extra = (m.citations ?? {}) as { sections?: Section[]; followUps?: string[] };
    return {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role === 'USER' ? 'user' : 'assistant',
      text: m.message,
      sections: extra.sections ?? [],
      followUps: extra.followUps ?? [],
      createdAt: m.createdAt,
    };
  }

  async history(actor: Actor, patientId: string, conversationId?: string) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const latest = conversationId
      ? { conversationId }
      : await this.db.chatMessage.findFirst({ where: { userId: actor.userId, patientId }, orderBy: { createdAt: 'desc' }, select: { conversationId: true } });
    if (!latest) return { conversationId: null, messages: [] };
    const rows = await this.db.chatMessage.findMany({
      where: { userId: actor.userId, patientId, conversationId: latest.conversationId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return { conversationId: latest.conversationId, messages: rows.map((r) => this.serialize(r)) };
  }

  async clear(actor: Actor, patientId: string) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    await this.db.chatMessage.deleteMany({ where: { userId: actor.userId, patientId } });
  }

  async chat(actor: Actor, patientId: string, input: z.infer<typeof ChatSchema>) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const conversationId = input.conversationId ?? randomUUID();

    const previous = await this.db.chatMessage.findMany({
      where: { userId: actor.userId, patientId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    await this.db.chatMessage.create({
      data: { userId: actor.userId, patientId, conversationId, role: 'USER', message: input.message, citations: {} },
    });

    let sections: Section[];
    let followUps: string[] = [];
    if (isEmergency(input.message)) {
      // Never routed through the model: fast, fixed, and always the same safe answer.
      sections = emergencyReply(this.emergencyNumber);
    } else {
      if (!this.llm) {
        throw new HttpError(503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not set up yet. Please try again later.');
      }
      const context = await this.patientContext(patientId);
      const history = previous.reverse().map((m) => ({
        role: m.role === 'USER' ? 'user' : 'model',
        parts: [{ text: m.message }],
      }));
      let text: string;
      try {
        text = await this.llm.generate({
          contents: [...history, { role: 'user', parts: [{ text: input.message }] }],
          config: {
            systemInstruction: `${ASSISTANT_RULES}\n\n${context}\n\nVERIFIED INFORMATION: none available yet.`,
            responseMimeType: 'application/json',
            responseJsonSchema: REPLY_JSON_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        });
      } catch (e) {
        if (e instanceof LlmError) throw new HttpError(e.retryable ? 503 : 502, 'ASSISTANT_UNAVAILABLE', e.message);
        throw e;
      }
      const parsed = safeParseReply(text);
      sections = parsed?.sections ?? SAFE_FALLBACK;
      followUps = parsed?.followUps ?? [];
      // Code-level backstop: no dose changes, stopping, or diagnoses — whatever the model said.
      if (containsUnsafeAdvice(sections)) {
        sections = SAFE_FALLBACK;
        followUps = [];
      }
    }

    const saved = await this.db.chatMessage.create({
      data: {
        userId: actor.userId,
        patientId,
        conversationId,
        role: 'ASSISTANT',
        message: sections.map((s) => s.text).join('\n\n'),
        citations: { sections, followUps } as object,
      },
    });
    return { conversationId, message: this.serialize(saved) };
  }
}

function safeParseReply(text: string): { sections: Section[]; followUps: string[] } | null {
  try {
    const r = ReplySchema.safeParse(JSON.parse(text));
    if (!r.success) return null;
    return {
      sections: r.data.sections.map((s) => ({ kind: s.kind, text: s.text.trim(), ...(s.source ? { source: s.source } : {}) })),
      followUps: r.data.followUps.map((f) => f.trim()).filter(Boolean).slice(0, 3),
    };
  } catch {
    return null;
  }
}
