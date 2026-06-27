/**
 * Phone normalization shared by the WhatsApp inbound webhook (Meta `wa_id`) and
 * the Shopify orders webhook (customer / address phone). The two sources format
 * the same number differently (`+965 9000 0000`, `0096590000000`, `90000000`),
 * so we reduce both to comparable forms before matching.
 */

/** Strip everything except digits, drop international `00` prefix. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 6 ? digits : null;
}

/**
 * Last 8 digits — the national subscriber number for GCC mobiles. Used as a
 * format-tolerant fallback when the country-code prefix differs between sources.
 */
export function nationalPhone(input: string | null | undefined): string | null {
  const digits = normalizePhone(input);
  if (!digits) return null;
  return digits.length >= 8 ? digits.slice(-8) : digits;
}
