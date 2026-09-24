import { ApiError, NetworkError } from '@/services/api/client';

export interface FormErrors {
  form?: string;
  fields: Record<string, string>;
}

/** Turn an API failure into a friendly form-level message plus per-field messages. */
export function toFormErrors(e: unknown): FormErrors {
  if (e instanceof ApiError) {
    const fields: Record<string, string> = {};
    for (const f of e.fields ?? []) fields[f.path] ??= f.message;
    return { form: Object.keys(fields).length ? undefined : e.message, fields };
  }
  if (e instanceof NetworkError) return { form: e.message, fields: {} };
  return { form: 'Something went wrong. Please try again.', fields: {} };
}
