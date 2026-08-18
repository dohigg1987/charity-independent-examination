import Image from "next/image";
import { Card } from "@fluentui/react-components";
import { CheckmarkCircle20Regular, LockClosed24Regular, ShieldCheckmark20Regular } from "@fluentui/react-icons";
import type { ReactNode } from "react";

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="About Clarity IE">
        <div className="auth-brand-content">
          <Image className="auth-logo" src="/clarity-ie-logo-inverse.svg" alt="Clarity IE" width={350} height={80} priority unoptimized />
          <p className="auth-brand-kicker">Independent examination, clearly controlled</p>
          <h2 className="auth-brand-title">Confidence from first file to final report.</h2>
          <p className="auth-brand-copy">A secure workspace for evidence, review and compliant charity independent examination.</p>
          <ul className="auth-assurance-list">
            <li><CheckmarkCircle20Regular aria-hidden="true" /> One controlled engagement record</li>
            <li><CheckmarkCircle20Regular aria-hidden="true" /> Review-ready evidence and decisions</li>
            <li><CheckmarkCircle20Regular aria-hidden="true" /> Clear sign-off and audit history</li>
          </ul>
        </div>
        <p className="auth-brand-foot"><ShieldCheckmark20Regular aria-hidden="true" /> Secure practice access</p>
      </section>
      <section className="auth-form-panel">
        <Card className="auth-card">
          <Image className="auth-mobile-logo" src="/clarity-ie-logo.svg" alt="Clarity IE" width={350} height={80} priority unoptimized />
          <span className="auth-lock" aria-hidden="true"><LockClosed24Regular /></span>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </Card>
        <p className="auth-help">Access is limited to authorised Clarity IE practice users.</p>
      </section>
    </main>
  );
}
