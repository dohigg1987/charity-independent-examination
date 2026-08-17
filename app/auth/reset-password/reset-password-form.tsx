"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
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
  if (complete) return <div className="auth-success" role="status"><CheckCircle2 aria-hidden="true" /><h2>Password updated</h2><p>Your new password is ready to use.</p><Link className="auth-submit auth-submit-link" href={signInHref}>Sign in <ArrowRight aria-hidden="true" /></Link></div>;
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <label className="auth-field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus /></label>
      <label className="auth-field"><span>Confirm new password</span><input name="password_confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
      <p className="auth-password-guidance">At least 12 characters. A passphrase is a good choice.</p>
      {message ? <p className="auth-message auth-message-error" role="alert">{message}</p> : null}
      <button className="auth-submit" type="submit" disabled={busy || !token}>{busy ? "Savingâ€¦" : "Set new password"}</button>
      {!token ? <Link className="auth-text-link" href={`/auth/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Request a new password link</Link> : <Link className="auth-text-link" href={signInHref}><ArrowLeft aria-hidden="true" /> Back to sign in</Link>}
    </form>
  );
}

