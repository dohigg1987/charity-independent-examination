export const INTERNAL_ROLES = [
  "ADMIN",
  "INDEPENDENT_EXAMINER",
  "REVIEWER",
  "PREPARER",
] as const;
export const CLIENT_ROLES = [
  "PORTAL_ADMIN",
  "CONTRIBUTOR",
  "READ_ONLY",
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];

export type Principal = {
  kind: "INTERNAL" | "CLIENT";
  email: string;
  name: string;
  role: InternalRole | ClientRole;
  clientIds: number[];
  clientRoles: Partial<Record<number, ClientRole>>;
};

export class AccessDeniedError extends Error {
  readonly status = 403;

  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class AuthenticationRequiredError extends Error {
  readonly status = 401;

  constructor(message = "Authentication is required") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export function isInternal(principal: Principal): boolean {
  return principal.kind === "INTERNAL";
}

export function canManagePractice(principal: Principal): boolean {
  return (
    principal.kind === "INTERNAL" &&
    ["ADMIN", "INDEPENDENT_EXAMINER"].includes(principal.role)
  );
}

export function canPrepare(principal: Principal): boolean {
  return (
    principal.kind === "INTERNAL" &&
    INTERNAL_ROLES.includes(principal.role as InternalRole)
  );
}

export function canReview(principal: Principal): boolean {
  return (
    principal.kind === "INTERNAL" &&
    ["ADMIN", "INDEPENDENT_EXAMINER", "REVIEWER"].includes(principal.role)
  );
}

export function canRespondForClient(
  principal: Principal,
  clientId: number,
): boolean {
  return (
    principal.kind === "CLIENT" &&
    principal.clientIds.includes(clientId) &&
    ["PORTAL_ADMIN", "CONTRIBUTOR"].includes(
      principal.clientRoles[clientId] ?? "READ_ONLY",
    )
  );
}

export function canAccessClient(
  principal: Principal,
  clientId: number,
): boolean {
  return (
    principal.kind === "INTERNAL" || principal.clientIds.includes(clientId)
  );
}

export function requirePermission(
  condition: boolean,
  message?: string,
): asserts condition {
  if (!condition) throw new AccessDeniedError(message);
}

export function requireIndependentReviewer(
  principal: Principal,
  preparedBy: string | null,
): void {
  requirePermission(canReview(principal), "Reviewer permission is required");
  if (
    preparedBy &&
    preparedBy.toLowerCase() === principal.email.toLowerCase()
  ) {
    throw new AccessDeniedError("The preparer cannot review their own work");
  }
}

export function normaliseRole(value: string): InternalRole | ClientRole | null {
  const role = value.toUpperCase();
  if (INTERNAL_ROLES.includes(role as InternalRole))
    return role as InternalRole;
  if (CLIENT_ROLES.includes(role as ClientRole)) return role as ClientRole;
  return null;
}
