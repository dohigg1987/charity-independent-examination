# Backup and restore

Neon point-in-time restore is Clarity IE's primary database recovery mechanism. R2 object retention/versioning and any legal hold controls are configured independently in Cloudflare. Recovery evidence must cover both stores because restoring Postgres alone can leave document metadata inconsistent with objects.

At least quarterly in preprod:

1. record the recovery point and deployed commit;
2. create a Neon recovery branch from that point;
3. connect a temporary, isolated Clarity Worker to the recovery branch and a recovery-only R2 copy;
4. verify tenant counts, audit-chain anchors, representative engagement reads and document hash matches;
5. record achieved RPO/RTO, exceptions and approval;
6. destroy temporary recovery resources after evidence is retained.

Never overwrite the production branch during an unverified restore. Promote a verified recovery branch or follow Neon's documented restore workflow under incident control.

