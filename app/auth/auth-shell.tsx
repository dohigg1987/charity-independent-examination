import Image from "next/image";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="About Clarity IE">
        <div className="auth-brand-content">
          <Image className="auth-logo" src="/clarity-ie-logo-dark.svg" alt="Clarity IE" width={350} height={80} priority unoptimized />
          <p className="auth-brand-kicker">Independent examination, clearly controlled</p>
          <h2>Confidence from first file to final report.</h2>
          <p className="auth-brand-copy">A secure workspace for evidence, review and compliant charity independent examination.</p>
          <ul className="auth-assurance-list">
            <li><CheckCircle2 aria-hidden="true" /> One controlled engagement record</li>
            <li><CheckCircle2 aria-hidden="true" /> Review-ready evidence and decisions</li>
            <li><CheckCircle2 aria-hidden="true" /> Clear sign-off and audit history</li>
          </ul>
        </div>
        <p className="auth-brand-foot"><ShieldCheck aria-hidden="true" /> Secure practice access</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <Image className="auth-mobile-logo" src="/clarity-ie-logo.svg" alt="Clarity IE" width={350} height={80} priority unoptimized />
          <span className="auth-lock" aria-hidden="true"><LockKeyhole /></span>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
        <p className="auth-help">Access is limited to authorised Clarity IE practice users.</p>
      </section>
    </main>
  );
}

