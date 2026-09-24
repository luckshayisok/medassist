/**
 * Medicine name as written (e.g. "Tab. Paracetamol 500mg", "Amlodipine + Atenolol") → the active
 * ingredient names openFDA uses. Indian/British names are mapped to US names. Only brands with a
 * single active ingredient are listed: a combination brand must never map to one of its parts.
 */

const US_NAME: Record<string, string> = {
  paracetamol: 'acetaminophen',
  salbutamol: 'albuterol',
  glibenclamide: 'glyburide',
  frusemide: 'furosemide',
  adrenaline: 'epinephrine',
  noradrenaline: 'norepinephrine',
  lignocaine: 'lidocaine',
  amoxycillin: 'amoxicillin',
  thyroxine: 'levothyroxine',
  'levothyroxine sodium': 'levothyroxine',
  pethidine: 'meperidine',
  rifampicin: 'rifampin',
  cyclosporin: 'cyclosporine',
  bendrofluazide: 'bendroflumethiazide',
  'vitamin d3': 'cholecalciferol',
  'vitamin d': 'cholecalciferol',
  'vitamin b12': 'cyanocobalamin',
  ecosprin: 'aspirin',
  dolo: 'acetaminophen',
  crocin: 'acetaminophen',
  calpol: 'acetaminophen',
  glycomet: 'metformin',
  thyronorm: 'levothyroxine',
  eltroxin: 'levothyroxine',
  pan: 'pantoprazole',
  pantocid: 'pantoprazole',
  pantop: 'pantoprazole',
  omez: 'omeprazole',
  razo: 'rabeprazole',
  rablet: 'rabeprazole',
  telma: 'telmisartan',
  amlong: 'amlodipine',
  stamlo: 'amlodipine',
  atorva: 'atorvastatin',
  rosuvas: 'rosuvastatin',
  clopilet: 'clopidogrel',
  januvia: 'sitagliptin',
  azee: 'azithromycin',
  montair: 'montelukast',
  allegra: 'fexofenadine',
  cetzine: 'cetirizine',
};

const FORM_WORDS =
  /\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|susp|suspension|inj|injection|oint|ointment|cream|gel|drops?|inhaler|rotacaps?|sr|er|xr|cr|od|mr|ds|mg|mcg|g|ml|iu|units?|%)\b\.?/gi;

export function ingredientsFromName(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)?/g, ' ')
    .replace(FORM_WORDS, ' ')
    .replace(/[^a-z+/&,\s-]/g, ' ');
  const parts = cleaned
    .split(/\s*(?:\+|\/|&|,|\band\b|\bwith\b)\s*/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 3);
  // Whole-name match only: "Pan D" or "Telma H" are combinations and must not become "Pan" / "Telma".
  const out = parts.map((p) => US_NAME[p] ?? p);
  return [...new Set(out)].slice(0, 3);
}
