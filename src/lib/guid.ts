/**
 * Sitecore stores ids in registry form — braced, upper-case, hyphenated.
 * The Authoring API accepts either form on input but echoes this one back,
 * so everything is normalised to it before comparison.
 */
export function normalizeGuid(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 32) return value.trim().toUpperCase();
  const upper = hex.toUpperCase();
  return `{${upper.slice(0, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}-${upper.slice(16, 20)}-${upper.slice(20)}}`;
}

export function guidsEqual(a: string, b: string): boolean {
  return normalizeGuid(a) === normalizeGuid(b);
}

/**
 * Write `value` in the same form as `sample` — braced or bare, hyphenated or
 * not, upper or lower case.
 *
 * Pages has its own preference, and it is not the registry form the Authoring
 * API echoes. Handing an id back to Pages in the form it reported its own ids
 * in is the one form known to work.
 */
export function formatGuidLike(value: string, sample: string): string {
  if (!isGuid(value) || !isGuid(sample)) return value;
  const trimmed = sample.trim();
  let formatted = normalizeGuid(value);
  if (!trimmed.startsWith("{")) formatted = formatted.slice(1, -1);
  if (!trimmed.includes("-")) formatted = formatted.replace(/-/g, "");
  return trimmed === trimmed.toLowerCase() ? formatted.toLowerCase() : formatted;
}

/** True when the string is a guid in any of the forms Sitecore accepts. */
export function isGuid(value: string): boolean {
  return /^[0-9a-fA-F]{32}$/.test(value.replace(/[^0-9a-fA-F]/g, ""));
}

/**
 * New rendering uids must be unique per page. crypto.randomUUID is available in
 * every browser the Cloud Portal supports and in Node 19+, which covers the
 * tests too.
 */
export function newGuid(): string {
  return normalizeGuid(crypto.randomUUID());
}
