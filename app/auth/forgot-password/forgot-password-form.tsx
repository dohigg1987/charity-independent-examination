"use client";

import Link from "next/link";
import { Body1, Button, Field, Input, MessageBar, MessageBarBody, Title3 } from "@fluentui/react-components";
import { ArrowLeft20Regular, MailCheckmark24Regular } from "@fluentui/react-icons";
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
  if (sent) return <div className="auth-success" role="status"><MailCheckmark24Regular aria-hidden="true" /><Title3 as="h2">Check your inbox</Title3><Body1>If an account matches that email, a password reset link is on its way.</Body1><Link className="auth-text-link" href={`/auth/sign-in?return_to=${encodeURIComponent(returnTo)}`}><ArrowLeft20Regular aria-hidden="true" /> Back to sign in</Link></div>;
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <Field className="auth-field" label="Email address" required><Input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourpractice.co.uk" required autoFocus size="large" /></Field>
      {message ? <MessageBar className="auth-message" intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}
      <Button className="auth-submit" appearance="primary" size="large" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      <Link className="auth-text-link" href={`/auth/sign-in?return_to=${encodeURIComponent(returnTo)}`}><ArrowLeft20Regular aria-hidden="true" /> Back to sign in</Link>
    </form>
  );
}
