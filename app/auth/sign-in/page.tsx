import { redirect } from "next/navigation";
import { AuthShell } from "@/app/auth/auth-shell";
import { getChatGPTUser, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import { AuthForm } from "./auth-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const returnTo = safeRelativeReturnPath((await searchParams).return_to ?? "/");
  if (await getChatGPTUser()) redirect(returnTo);
  return (
    <AuthShell eyebrow="Secure practice access" title="Welcome back" description="Sign in with the email address linked to your practice account.">
      <AuthForm returnTo={returnTo} />
    </AuthShell>
  );
}

