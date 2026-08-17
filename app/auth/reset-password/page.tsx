import { AuthShell } from "@/app/auth/auth-shell";
import { safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ return_to?: string; token?: string }> }) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to ?? "/");
  return <AuthShell eyebrow="Secure password setup" title="Choose a new password" description="Use a unique password with at least 12 characters."><ResetPasswordForm token={params.token ?? ""} returnTo={returnTo} /></AuthShell>;
}

