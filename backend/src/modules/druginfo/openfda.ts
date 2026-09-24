/**
 * Official drug label text from openFDA (US FDA structured product labels). Free, no key needed.
 * We keep only patient-relevant sections, never dosing sections: the patient's own prescription
 * is the only authority on how much to take.
 */

export type LabelSectionKey = 'uses' | 'warnings' | 'sideEffects' | 'interactions' | 'patientInfo' | 'avoid' | 'olderAdults';

export interface LabelRecord {
  title: string;
  setId: string;
  effectiveDate: string | null;
  sections: Partial<Record<LabelSectionKey, string[]>>;
}

export interface LabelSource {
  /** One active ingredient (lower-case, US name). null = no single-ingredient label found. */
  fetchLabel(ingredient: string): Promise<LabelRecord | null>;
}

/** Which openFDA fields feed each of our sections (prescription and OTC labels use different ones). */
const FIELDS: Record<LabelSectionKey, string[]> = {
  uses: ['indications_and_usage', 'purpose'],
  warnings: ['boxed_warning', 'warnings_and_cautions', 'warnings', 'precautions', 'contraindications', 'do_not_use'],
  sideEffects: ['adverse_reactions', 'stop_use'],
  interactions: ['drug_interactions', 'ask_doctor_or_pharmacist'],
  patientInfo: ['information_for_patients', 'spl_patient_package_insert', 'spl_medguide'],
  avoid: ['when_using', 'ask_doctor'],
  olderAdults: ['geriatric_use'],
};

const MAX_CHUNKS_PER_SECTION = 40;
const CHUNK_CHARS = 420;

/** Label text → short plain chunks: section numbers/headings removed, split near sentence ends. */
export function toChunks(raw: string[]): string[] {
  const text = raw
    .join(' ')
    .replace(/\s+/g, ' ')
    // Section numbers at the start of a heading: "5 WARNINGS…", "5.1 Lactic Acidosis", "1 Treatment of…".
    .replace(/(^|[.:]\s)\d+(\.\d+)*\s+(?=[A-Z])/g, '$1')
    .replace(/\b\d+\.\d+\s+(?=[A-Z])/g, '')
    // All-caps headings ("INDICATIONS AND USAGE", "USES") right before normal sentence text.
    .replace(/\b[A-Z][A-Z&,/ -]{3,}[A-Z]\b\s+(?=[A-Z•]?[a-z•])/g, '')
    .replace(/\[see [^\]]*\]/gi, '')
    .replace(/\(\s*\d+(\.\d+)*\s*\)/g, '')
    .trim();
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > CHUNK_CHARS) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter((c) => c.length > 25).slice(0, MAX_CHUNKS_PER_SECTION);
}

type OpenFdaResult = Record<string, unknown> & {
  set_id?: string;
  effective_time?: string;
  openfda?: { generic_name?: string[]; brand_name?: string[]; substance_name?: string[]; product_type?: string[] };
};

export function pickLabel(ingredient: string, results: OpenFdaResult[]): OpenFdaResult | null {
  const want = ingredient.toUpperCase();
  const single = results.filter((r) => {
    const subs = r.openfda?.substance_name ?? [];
    // Exactly one active ingredient, and it is ours (salt forms like "METFORMIN HYDROCHLORIDE" are fine).
    return subs.length === 1 && (subs[0] === want || subs[0]!.startsWith(`${want} `));
  });
  if (!single.length) return null;
  // Prefer prescription labels (richer patient sections), then the most recently updated.
  return single.sort((a, b) => {
    const rx = (r: OpenFdaResult) => (r.openfda?.product_type?.[0] === 'HUMAN PRESCRIPTION DRUG' ? 1 : 0);
    return rx(b) - rx(a) || String(b.effective_time ?? '').localeCompare(String(a.effective_time ?? ''));
  })[0]!;
}

export function toRecord(ingredient: string, r: OpenFdaResult): LabelRecord {
  const sections: LabelRecord['sections'] = {};
  for (const [key, fields] of Object.entries(FIELDS) as [LabelSectionKey, string[]][]) {
    const raw = fields.flatMap((f) => (Array.isArray(r[f]) ? (r[f] as string[]) : []));
    const chunks = raw.length ? toChunks(raw) : [];
    if (chunks.length) sections[key] = chunks;
  }
  const name = ingredient.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: name,
    setId: String(r.set_id ?? ''),
    effectiveDate: typeof r.effective_time === 'string' ? r.effective_time.slice(0, 8) : null,
    sections,
  };
}

export class OpenFdaSource implements LabelSource {
  constructor(
    private readonly baseUrl = 'https://api.fda.gov/drug/label.json',
    private readonly timeoutMs = 8000,
  ) {}

  async fetchLabel(ingredient: string): Promise<LabelRecord | null> {
    const q = `openfda.substance_name:"${ingredient.replace(/"/g, '')}"`;
    const url = `${this.baseUrl}?search=${encodeURIComponent(q)}&limit=25`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 404) return null; // openFDA answers "no matches" with 404
    if (!res.ok) throw new Error(`openFDA ${res.status}`);
    const body = (await res.json()) as { results?: OpenFdaResult[] };
    const picked = pickLabel(ingredient, body.results ?? []);
    return picked ? toRecord(ingredient, picked) : null;
  }
}
