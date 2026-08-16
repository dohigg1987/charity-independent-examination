import { AccessDeniedError, AuthenticationRequiredError } from "@/lib/authz";
import { RequestSecurityError, securityHeaders } from "@/lib/security";

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: { ...securityHeaders(), ...init.headers },
  });
}

export function errorResponse(error: unknown, fallback: string): Response {
  const status =
    error instanceof AuthenticationRequiredError
      ? 401
      : error instanceof AccessDeniedError ||
          error instanceof RequestSecurityError
        ? error.status
        : 500;
  const message =
    status >= 500
      ? fallback
      : error instanceof Error
        ? error.message
        : fallback;
  return json({ error: message }, { status });
}
