# Operations and service management

## Service objectives

The target service objective is 99.9% monthly availability, excluding agreed maintenance. Target recovery time is four hours and target recovery point is 24 hours. These are operating targets until demonstrated by monitoring and restore exercises, not contractual guarantees.

## Monitoring and alerting

The service owner must monitor deployment failures, unhandled worker exceptions, elevated 4xx/5xx rates, authentication failures, rate-limit activity, D1 capacity, R2 errors and unusual document-download volume. Alerts need an accountable on-call recipient and a tested escalation route.

Suggested severities:

- SEV1: confirmed data exposure, loss of access to all live engagements, destructive corruption or active compromise. Respond immediately, contain access and notify the incident lead.
- SEV2: material workflow unavailable, repeated write failures or suspected unauthorized access. Respond within one hour.
- SEV3: localized defect with a workaround. Triage within one working day.

Record incident timeline, decisions, affected records, containment, recovery, notifications and follow-up actions. Consider ICO notification deadlines using the approved incident process and legal advice.

## Backup, restore and continuity

The operator must enable platform backups or exports for D1 and R2, encrypt them, restrict access and define retention. At least quarterly, restore a representative database and document set into an isolated environment, verify record counts and hashes, and record achieved recovery time and recovery point. A backup is not considered effective until a restore has passed.

## Release and rollback

Every production change must pass `docs/RELEASE_STANDARD.md`, create a traceable checkpoint and identify database migrations. Backward-compatible additive migrations are preferred. Before a destructive migration, take a verified export and define a tested rollback or forward-fix procedure. After deployment, verify authentication, client isolation, one read path, one write path, document authorization and worker error logs.

## Joiners, movers and leavers

Grant the minimum role needed. Verify the recipient before access is enabled. Review privileged users quarterly and all client-portal assignments before each engagement starts. Deactivate leavers promptly and retain the audit trail rather than deleting their identity record.
