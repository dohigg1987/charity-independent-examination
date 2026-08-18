"use client";

import Link from "next/link";
import { Body1, Button, Field, Input, MessageBar, MessageBarBody, Title3 } from "@fluentui/react-components";
import { ArrowLeft20Regular, ArrowRight20Regular, CheckmarkCircle24Regular } from "@fluentui/react-icons";
import { type FormEvent, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";

export function ResetPasswordForm({ token, returnTo }: { token: string; returnTo: string }) {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const signInHref = `/auth/sign-in?return_to=${encodeURIComponent(returnTo)}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    if (!token) { setMessage("This password link is missing or invalid. Request a new one below."); return; }
    if (password.length < 12) { setMessage("Choose a password with at least 12 characters."); return; }
    if (password !== confirmation) { setMessage("The passwords do not match."); return; }
    setBusy(true);
    try {
      const client = await getAuthClient();
      const result = await client.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error("Unable to reset password");
      setComplete(true);
    } catch { setMessage("This password link has expired or has already been used. Request a new one."); }
    finally { setBusy(false); }
  }
  if (complete) return <div className="auth-success" role="status"><CheckmarkCircle24Regular aria-hidden="true" /><Title3 as="h2">Password updated</Title3><Body1>Your new password is ready to use.</Body1><Link className="auth-submit auth-submit-link" href={signInHref}>Sign in <ArrowRight20Regular aria-hidden="true" /></Link></div>;
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <Field className="auth-field" label="New password" required><Input name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus size="large" /></Field>
      <Field className="auth-field" label="Confirm new password" required><Input name="password_confirmation" type="password" autoComplete="new-password" minLength={12} required size="large" /></Field>
      <p className="auth-password-guidance">At least 12 characters. A passphrase is a good choice.</p>
      {message ? <MessageBar className="auth-message" intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}
      <Button className="auth-submit" appearance="primary" size="large" type="submit" disabled={busy || !token}>{busy ? "Saving…" : "Set new password"}</Button>
      {!token ? <Link className="auth-text-link" href={`/auth/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Request a new password link</Link> : <Link className="auth-text-link" href={signInHref}><ArrowLeft20Regular aria-hidden="true" /> Back to sign in</Link>}
    </form>
  );
}
