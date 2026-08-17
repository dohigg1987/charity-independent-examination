import { AuthShell } from "@/app/auth/auth-shell";
import { safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const returnTo = safeRelativeReturnPath((await searchParams).return_to ?? "/");
  return <AuthShell eyebrow="Account recovery" title="Reset your password" description="Enter your account email and weâ€™ll send a secure, time-limited reset link."><ForgotPasswordForm returnTo={returnTo} /></AuthShell>;
}

