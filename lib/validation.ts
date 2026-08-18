import { RequestSecurityError } from "@/lib/file-security";

const MAX_STRING_LENGTH = 20_000;
const MAX_COLLECTION_SIZE = 1_000;
const MAX_DEPTH = 8;

export function validatePayload(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH)
    throw new RequestSecurityError("Request payload is too deeply nested", 400);
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH)
      throw new RequestSecurityError(
        "A request field exceeds the permitted length",
        400,
      );
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_SIZE)
      throw new RequestSecurityError("Request collection is too large", 400);
    value.forEach((item) => validatePayload(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_COLLECTION_SIZE)
      throw new RequestSecurityError("Request object is too large", 400);
    for (const [key, item] of entries) {
      if (key.length > 100)
        throw new RequestSecurityError("Request field name is too long", 400);
      validatePayload(item, depth + 1);
    }
  }
}

export function requireEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestSecurityError("Enter a valid email address", 400);
  }
  return email;
}

export function optionalEmail(value: string): string {
  return value.trim() ? requireEmail(value) : "";
}

export function requireOneOf(
  value: string,
  allowed: readonly string[],
  label: string,
): string {
  if (!allowed.includes(value))
    throw new RequestSecurityError(`Select a valid ${label}`, 400);
  return value;
}

export function requireIsoDate(value: string, label: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new RequestSecurityError(`Enter a valid ${label}`, 400);
  }
  return value;
}

export function requireNonNegativeNumber(
  value: unknown,
  label: string,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new RequestSecurityError(
      `${label} must be a non-negative number`,
      400,
    );
  return number;
}
