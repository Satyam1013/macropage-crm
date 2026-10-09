/** Escapes user input for safe use inside a RegExp (prevents ReDoS/regex injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a `$or` of case-insensitive "contains" matches across fields, or undefined if blank. */
export function containsAny(
  fields: string[],
  search?: string,
): Record<string, unknown> | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  const re = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((f) => ({ [f]: re })) };
}
