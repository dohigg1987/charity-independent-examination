"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";

export function AuthForm({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const client = await getAuthClient();
      const result = await client.signIn.email({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") });
      if (result.error) throw new Error("Authentication failed");
      window.location.assign(returnTo);
    } catch {
      setMessage("We could not sign you in. Check your email address and password, then try again.");
    } finally { setBusy(false); }
  }
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      <label className="auth-field"><span>Email address</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourpractice.co.uk" required /></label>
      <label className="auth-field">
        <span className="auth-field-heading"><span>Password</span><Link href={`/auth/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Forgot password?</Link></span>
        <span className="auth-password-input">
          <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" minLength={8} required />
          <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</button>
        </span>
      </label>
      {message ? <p className="auth-message auth-message-error" role="alert">{message}</p> : null}
      <button className="auth-submit" type="submit" disabled={busy}><span>{busy ? "Signing inâ€¦" : "Sign in"}</span>{!busy ? <ArrowRight aria-hidden="true" /> : null}</button>
    </form>
  );
}

