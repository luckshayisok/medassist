/**
 * Deterministic safety layer around the assistant. These checks run in code, before and after
 * the model, so safety never depends on the model following instructions.
 */

export type SectionKind = 'prescription' | 'verified' | 'general' | 'safety' | 'emergency';
export interface Section {
  kind: SectionKind;
  text: string;
  source?: string;
}

// Phrases that mean "this might be an emergency" (English + common Hinglish). Kept broad on purpose:
// a false alarm costs a sentence, a miss could cost much more.
const EMERGENCY_PATTERNS: RegExp[] = [
  /chest (pain|tightness|pressure)/i,
  /(can'?t|cannot|can not|unable to|hard to|difficulty|trouble) breath/i,
  /short(ness)? of breath/i,
  /saans (nahi|nahin|lene me)/i,
  /(took|taken|swallowed|had) (too many|too much|an overdose|double|extra|all (my|the))/i,
  /\boverdos/i,
  /\b(suicid|kill myself|end my life|want to die)/i,
  /(unconscious|passed out|fainted|not waking|won'?t wake|behosh)/i,
  /\b(seizure|fits|convulsion)/i,
  /\bstroke\b|face (is )?droop|slurred speech|can'?t (move|feel) (my )?(arm|leg|face)/i,
  /swell(ing|ed|en)? .{0,20}(face|lips?|tongue|throat)/i,
  /(face|lips?|tongue|throat) .{0,20}swell/i,
  /(severe|bad) (allergic|allergy)|anaphyla/i,
  /(vomiting|coughing|throwing up) blood|bleeding (heavily|a lot|won'?t stop)/i,
  /(sugar|glucose) (is )?(very |too )?(low|high)\b.{0,30}(dizzy|confus|shak|sweat|faint)/i,
  /\bemergency\b/i,
];

export function isEmergency(message: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(message));
}

export function emergencyReply(emergencyNumber: string): Section[] {
  return [
    {
      kind: 'emergency',
      text: `This could be an emergency. Please call ${emergencyNumber} now, or ask someone nearby to take you to the nearest hospital. If you took too much of a medicine, keep the medicine box with you to show the doctor.`,
    },
    { kind: 'safety', text: "MedAssist can't help in an emergency. Please don't wait for the app." },
  ];
}

// Advice the assistant must never give, whatever the model says. Checked on every section that is
// not a direct quote of the patient's own prescription.
const UNSAFE_ADVICE: RegExp[] = [
  /\b(double|increase|raise|up|reduce|lower|decrease|halve|cut) (your|the|this) (dose|dosage)/i,
  /\btake (an )?(extra|additional|another|double|two|2|more) (dose|tablets?|pills?|capsules?)\b/i,
  /\b(you can|you should|it'?s (fine|ok|okay|safe) to|feel free to) (stop|skip|quit|discontinue|double|start taking)/i,
  /\bstop taking\b/i,
  /\bdon'?t take (it|this|your)\b/i,
  /\bmake up for (the|a|your) missed dose\b/i,
  /\byou (have|probably have|may have|might have|likely have) (diabetes|cancer|an infection|a heart|high blood|kidney|liver)/i,
];

// A warning like "Never take a double dose" or "Do not stop taking it" is safe advice. Only a match
// with no negation just before it (in the same sentence) counts as unsafe.
const NEGATED = /\b(never|not|don'?t|do not|should ?n'?o?t|must ?n'?o?t|avoid|no need to|please don'?t)\b[^.!?]{0,20}$/i;

function unsafeText(text: string): boolean {
  return UNSAFE_ADVICE.some((pattern) => unsafeMatch(pattern, text));
}

/** Indexes of the rules that fired, for logs. */
export function unsafeRules(sections: Section[]): number[] {
  const texts = sections.filter((s) => s.kind !== 'prescription').map((s) => s.text);
  return UNSAFE_ADVICE.flatMap((p, i) => (texts.some((t) => unsafeMatch(p, t)) ? [i] : []));
}

function unsafeMatch(pattern: RegExp, text: string): boolean {
  const re = new RegExp(pattern.source, 'gi');
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).split(/[.!?]\s/).pop() ?? '';
    // "don't take it" is itself a stop instruction, so it is never excused by its own "don't".
    if (!NEGATED.test(before)) return true;
  }
  return false;
}

export function containsUnsafeAdvice(sections: Section[]): boolean {
  return sections.some((s) => s.kind !== 'prescription' && unsafeText(s.text));
}

export const SAFE_FALLBACK: Section[] = [
  {
    kind: 'safety',
    text: "I can't advise on changing, stopping, starting or making up medicine doses. Please ask your doctor or pharmacist - they know your full health history.",
  },
];
