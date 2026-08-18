"use client";

import Link from "next/link";
import { Button, Field, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ArrowRight20Regular, Eye20Regular, EyeOff20Regular } from "@fluentui/react-icons";
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
      <Field className="auth-field" label="Email address" required>
        <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@yourpractice.co.uk" required size="large" />
      </Field>
      <div className="auth-password-field">
        <Field className="auth-field" label="Password" required>
          <Input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" minLength={8} required size="large" contentAfter={<Button type="button" appearance="subtle" size="small" icon={showPassword ? <EyeOff20Regular /> : <Eye20Regular />} onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} />} />
        </Field>
        <Link className="auth-forgot-link" href={`/auth/forgot-password?return_to=${encodeURIComponent(returnTo)}`}>Forgot password?</Link>
      </div>
      {message ? <MessageBar className="auth-message" intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}
      <Button className="auth-submit" appearance="primary" size="large" type="submit" disabled={busy} iconPosition="after" icon={!busy ? <ArrowRight20Regular /> : undefined}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
