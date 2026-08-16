# Security policy

Clarity IE contains confidential charity records and is designed for authenticated, least-privilege use. Security defects should not be reported through public issues. Report them privately to the system owner and include the affected route, reproduction steps and impact. Do not include real client data.

## Implemented controls

- ChatGPT identity is required in production. Identity is resolved against an active internal user or an active client-portal user.
- Server-side role checks separate administration, preparation, review and client contribution. Client users are restricted to assigned charities and engagements.
- A preparer cannot review their own recorded procedure, task, trial-balance or engagement work.
- State-changing routes require same-origin requests, an expected content type, bounded payloads and rate limiting.
- Uploads are limited to PDF, DOCX, XLSX, CSV, JPEG and PNG, with size, extension, MIME and file-signature checks. Legacy and macro-enabled Office files are rejected.
- Downloads are authorized on every request and use safe filenames, `nosniff`, private caching and restrictive browser headers.
- Audit events include a SHA-256 hash chained to the previous event. This is tamper-evident application evidence, not immutable WORM storage.
- Production dependencies and the build chain are checked with `npm audit`; required release gates are documented in `docs/RELEASE_STANDARD.md`.

## Residual controls requiring an operator

- File-signature verification is not malware scanning. A commercial deployment should route uploads through a managed malware-scanning service before files are released to users.
- The hosting owner must maintain an approved user register, promptly deactivate leavers and review privileged access at least quarterly.
- A qualified third party should perform an independent penetration test before handling live client data and after material identity, storage or authorization changes.
- Secrets, backups, platform logs, D1 and R2 access policies remain hosting controls and must be reviewed in the owning workspace.
- Content Security Policy presently permits inline styles and scripts required by the application framework. Tightening this with nonces should be tracked with framework support.

## Supported security updates

Only the current production version is supported. Critical and high-severity exploitable findings require immediate triage and an expedited release. Production data must never be copied to local development or test environments.
