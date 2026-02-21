/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 * Returns null if the input cannot be parsed into a valid 10-digit US number.
 */
export function toE164(phone: string): string | null {
  // Strip everything except digits and leading +
  const stripped = phone.replace(/[^\d+]/g, "");

  // Already E.164 with +1 and 10 digits
  if (/^\+1\d{10}$/.test(stripped)) return stripped;

  // Digits only
  const digits = stripped.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}
