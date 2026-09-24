import type { z } from 'zod';
import { HttpError } from '../lib/errors.js';

/** Parse untrusted input with a Zod schema; throws a 422 with field messages on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const err = new HttpError(422, 'VALIDATION_ERROR', fields[0]?.message ?? 'Invalid input');
    (err as HttpError & { fields: typeof fields }).fields = fields;
    throw err;
  }
  return result.data;
}
