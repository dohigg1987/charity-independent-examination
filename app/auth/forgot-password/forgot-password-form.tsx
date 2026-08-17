"use client";

import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";

export function ForgotPasswordForm({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      const client = await getAuthClient();
      const redirectTo = `${window.location.origin}/auth/reset-password?return_to=${encodeURIComponent(returnTo)}`;
      const result = await client.requestPasswordReset({ email, redirectTo });
      if (result.error) throw new Error("Unable to request reset");
      setSent(true);
    } catch { setMessage("We could not send the reset email. Please try again in a moment."); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="auth-success" role="status"><MailCheck aria-hidden="true" /><h2>Check your inbox</h2><p>If an account matches that email, a password reset link is on its way.</p><Link className="auth-text-link" href={`/auth/sign-in?return_to=${encodeURIComponent(returnTo)}`}><ArrowLeft aria-hidden="true" /> Back to sign in</Link></div>;
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <label className="auth-field"><span>Email address</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourpractice.co.uk" required autoFocus /></label>
      {message ? <p className="auth-message auth-message-error" role="alert">{message}</p> : null}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Sendingâ€¦" : "Send reset link"}</button>
      <Link className="auth-text-link" href={`/auth/sign-in?return_to=${encodeURIComponent(returnTo)}`}><ArrowLeft aria-hidden="true" /> Back to sign in</Link>
    </form>
  );
}

