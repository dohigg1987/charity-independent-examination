import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";
import { getChatGPTUser, safeRelativeReturnPath } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const returnTo = safeRelativeReturnPath((await searchParams).return_to ?? "/"); if (await getChatGPTUser()) redirect(returnTo);
  return <main className="access-denied-page"><section aria-labelledby="signin-title"><p className="eyebrow">CLARITY IE SECURE ACCESS</p><h1 id="signin-title">Sign in to Clarity IE</h1><p>Use the account provisioned by your practice administrator.</p><AuthForm returnTo={returnTo} /></section></main>;
}

