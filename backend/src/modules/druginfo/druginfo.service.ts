import type { Db } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { ingredientsFromName } from './ingredients.js';
import type { LabelRecord, LabelSectionKey, LabelSource } from './openfda.js';

const FRESH_MS = 30 * 24 * 3600_000;
const MISS_RETRY_MS = 7 * 24 * 3600_000;

export interface VerifiedLabel extends LabelRecord {
  ingredient: string;
  /** Exact source name the assistant must quote for "verified" sections. */
  source: string;
}

export interface VerifiedSnippet {
  source: string;
  medicine: string;
  topic: LabelSectionKey;
  text: string;
}

/** Words in the question → label sections worth reading first. */
const TOPICS: [RegExp, LabelSectionKey[]][] = [
  [/\b(for|used|use|why|purpose|what is|treat)\b/i, ['uses', 'patientInfo']],
  [/\b(side ?effects?|feel|dizz|nause|sick|tired|pain|rash|cough|swell|sleep|stomach|diarr|constipat|headache)\w*/i, ['sideEffects', 'patientInfo', 'warnings']],
  [/\b(alcohol|drink|wine|beer|food|eat|grapefruit|juice|milk|coffee|tea|diet)\w*/i, ['avoid', 'interactions', 'patientInfo', 'warnings']],
  [/\b(together|with|interact|combine|mix|other (medicine|drug)s?|painkiller|ibuprofen|aspirin)\b/i, ['interactions', 'avoid']],
  [/\b(safe|danger|risk|warning|careful|avoid|elderly|old|age|kidney|liver|pregnan|drive|driving)\w*/i, ['warnings', 'olderAdults', 'avoid']],
];
const DEFAULT_TOPICS: LabelSectionKey[] = ['uses', 'patientInfo', 'warnings'];

const STOP = new Set('the a an and or of to for is are was be it this that my me i what how when can should do does with in on at if'.split(' '));
const words = (s: string) => s.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)) ?? [];

export class DrugInfoService {
  constructor(
    private readonly db: Db,
    private readonly source: LabelSource | null,
  ) {}

  /** Cached label for one ingredient; fetched from the source when missing or stale. Never throws. */
  async label(ingredient: string, now = Date.now()): Promise<VerifiedLabel | null> {
    const cached = await this.db.drugLabel.findUnique({ where: { ingredient } });
    const age = cached ? now - cached.fetchedAt.getTime() : Infinity;
    const fresh = cached && age < (cached.found ? FRESH_MS : MISS_RETRY_MS);
    if (!fresh && this.source) {
      try {
        const rec = await this.source.fetchLabel(ingredient);
        const data = {
          found: !!rec,
          title: rec?.title ?? null,
          setId: rec?.setId ?? null,
          effectiveDate: rec?.effectiveDate ?? null,
          sections: (rec?.sections ?? {}) as object,
          fetchedAt: new Date(now),
        };
        const row = await this.db.drugLabel.upsert({ where: { ingredient }, create: { ingredient, ...data }, update: data });
        return toVerified(row);
      } catch (e) {
        // Source down: fall back to whatever we had (even stale), or nothing.
        logger.warn({ ingredient, reason: String((e as Error).message).slice(0, 120) }, 'drug label fetch failed');
      }
    }
    return cached ? toVerified(cached) : null;
  }

  /** Labels for every ingredient of the given medicine names (e.g. the patient's list). */
  async labelsFor(medicineNames: string[]): Promise<Map<string, VerifiedLabel[]>> {
    const out = new Map<string, VerifiedLabel[]>();
    await Promise.all(
      medicineNames.map(async (name) => {
        const labels = (await Promise.all(ingredientsFromName(name).map((i) => this.label(i)))).filter((l): l is VerifiedLabel => !!l);
        if (labels.length) out.set(name, labels);
      }),
    );
    return out;
  }

  /**
   * The few label passages most relevant to a question. Medicines named in the question come first;
   * otherwise every medicine gets a share. Kept short: free-tier prompts, and older readers.
   */
  async snippetsFor(question: string, medicineNames: string[], maxChars = 3200): Promise<VerifiedSnippet[]> {
    if (!medicineNames.length) return [];
    const labels = await this.labelsFor(medicineNames);
    if (!labels.size) return [];

    const q = question.toLowerCase();
    const named = [...labels.keys()].filter((n) => q.includes(n.toLowerCase()) || labels.get(n)!.some((l) => q.includes(l.ingredient)));
    const targets = named.length ? named : [...labels.keys()];
    const topics = [...new Set(TOPICS.filter(([re]) => re.test(question)).flatMap(([, t]) => t))];
    const order = topics.length ? topics : DEFAULT_TOPICS;
    const qWords = new Set(words(question));

    const perMed = Math.floor(maxChars / targets.length);
    const out: VerifiedSnippet[] = [];
    for (const med of targets) {
      let used = 0;
      for (const label of labels.get(med)!) {
        const candidates = order.flatMap((topic, rank) =>
          (label.sections[topic] ?? []).map((text, i) => ({
            topic,
            text,
            // Topic order first, then overlap with the question's words, then earlier passages.
            score: (order.length - rank) * 10 + words(text).filter((w) => qWords.has(w)).length * 3 - i * 0.1,
          })),
        );
        for (const c of candidates.sort((a, b) => b.score - a.score)) {
          if (used + c.text.length > perMed) continue;
          used += c.text.length;
          out.push({ source: label.source, medicine: med, topic: c.topic, text: c.text });
          if (out.filter((o) => o.medicine === med).length >= 4) break;
        }
      }
    }
    return out;
  }
}

function toVerified(row: { ingredient: string; found: boolean; title: string | null; setId: string | null; effectiveDate: string | null; sections: unknown }): VerifiedLabel | null {
  if (!row.found || !row.title) return null;
  const date = row.effectiveDate ? ` (${row.effectiveDate.slice(0, 4)})` : '';
  return {
    ingredient: row.ingredient,
    title: row.title,
    setId: row.setId ?? '',
    effectiveDate: row.effectiveDate,
    sections: row.sections as LabelRecord['sections'],
    source: `US FDA label: ${row.title}${date}`,
  };
}
