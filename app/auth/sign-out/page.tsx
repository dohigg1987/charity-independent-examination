"use client";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";
export default function SignOutPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("return_to") || "/"; const returnTo = value.startsWith("/") && !value.startsWith("//") ? value : "/"; void getAuthClient().then((client) => client.signOut()).then(({ error }) => error ? setFailed(true) : window.location.replace(returnTo)).catch(() => setFailed(true)); }, []);
  return <main className="access-denied-page"><section className="access-denied-panel"><h1>{failed ? "Sign out needs attention" : "Signing you outâ€¦"}</h1>{failed ? <button className="primary" onClick={() => window.location.reload()}>Try again</button> : null}</section></main>;
}

