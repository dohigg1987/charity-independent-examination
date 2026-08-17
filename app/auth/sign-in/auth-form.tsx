"use client";
import { type FormEvent, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";
export function AuthForm({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null); const form = new FormData(event.currentTarget);
    try { const client = await getAuthClient(); const result = await client.signIn.email({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") }); if (result.error) throw new Error(result.error.message || "Authentication failed."); window.location.assign(returnTo); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed."); } finally { setBusy(false); }
  }
  return <form className="access-denied-panel" onSubmit={submit}><label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>{message ? <p role="alert">{message}</p> : null}<button className="primary" type="submit" disabled={busy}>{busy ? "Please waitâ€¦" : "Sign in securely"}</button></form>;
}

