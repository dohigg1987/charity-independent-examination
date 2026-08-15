# Security policy

## Intended control environment

Clarity IE is designed for confidential financial, governance and personal information. Production deployment requires:

1. SSO or passwordless authentication with mandatory MFA for practitioners.
2. Server-side authorisation on every request, based on tenant, engagement assignment and role.
3. PostgreSQL row-level security as defence in depth, with tenant context set per transaction.
4. TLS 1.2 or later in transit and managed key encryption at rest for databases, backups and documents.
5. Private object storage, short-lived upload and download URLs, file-type validation, size limits and malware scanning before release.
6. Append-only audit events, immutable sign-off snapshots and monitored privileged actions.
7. UK-region hosting, documented subprocessors, data-processing terms, recovery testing and a defined breach process.
8. Automated dependency, secret, SAST and infrastructure scanning in protected branch workflows.

The current user interface contains illustrative data only. It must not receive live client evidence until the production controls above are implemented and independently tested.

## Reporting vulnerabilities

Do not disclose suspected vulnerabilities in a public issue. Contact the repository owner privately with the affected component, reproduction steps and potential impact.
