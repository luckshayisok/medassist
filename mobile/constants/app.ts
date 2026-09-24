export const APP_NAME = 'MedAssist';

/**
 * Local emergency number. 112 works across India and the EU (and redirects on most GSM phones).
 * Make this region-configurable before launching in other countries (e.g. 911 in the US).
 */
export const EMERGENCY_NUMBER = '112';

export const DISCLAIMER =
  'MedAssist helps you follow the plan your doctor gave you. It does not replace your doctor or pharmacist.';

export const SNOOZE_OPTIONS = [
  { minutes: 10, label: '10 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
] as const;

export const SKIP_REASONS = [
  { value: 'FORGOT', label: 'Forgot' },
  { value: 'UNWELL', label: 'Feeling unwell' },
  { value: 'RAN_OUT', label: 'Ran out of medicine' },
  { value: 'DOCTOR_ADVISED', label: 'Doctor told me to skip it' },
  { value: 'OTHER', label: 'Other' },
] as const;
