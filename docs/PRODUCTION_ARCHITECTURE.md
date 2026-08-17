# Clarity IE production architecture

Clarity IE is an independent service. QuoteBench supplied reusable operating lessons only. Clarity must not share QuoteBench Workers, Neon projects or branches, Hyperdrive configurations, R2 buckets, authentication tenants, secrets, domains, pipelines, telemetry or customer data.

## Environment topology

| Environment | Cloudflare | Neon | Release gate |
|---|---|---|---|
| dev | `clarity-ie-dev`, `clarity-ie-dev-files`, dedicated Hyperdrive | Clarity dev branch and Auth configuration | green CI on `main` |
| test | `clarity-ie-test`, `clarity-ie-test-files`, dedicated Hyperdrive | Clarity test branch and Auth configuration | exact SHA deployed to dev |
| preprod | `clarity-ie-preprod`, `clarity-ie-preprod-files`, dedicated Hyperdrive | Clarity preprod branch and Auth configuration | exact SHA deployed to test plus approval |
| production | `clarity-ie-production`, `clarity-ie-production-files`, dedicated Hyperdrive | Clarity production branch and Auth configuration | exact SHA deployed to preprod, approval and `main` ancestry |

Every environment has a separate GitHub Environment and unique credentials. No runtime may read another environment's database or object storage. Hyperdrive connects to the matching Neon branch using an unpooled Postgres connection; the application uses Hyperdrive's generated connection string with `pg`.

## Release model

GitHub `main` is the sovereign source. CI tests a full commit SHA. The same SHA is rebuilt deterministically and promoted dev â†’ test â†’ preprod â†’ production. Successful stages create immutable `deployed-<environment>-<sha>` tags, preventing bypass. Builds receive SHA-256 manifests and GitHub provenance attestations.

Database migrations are checksum-locked and serialized with a Postgres advisory transaction lock. New destructive migrations fail CI unless the migration policy is deliberately changed and reviewed. Application changes must use expand/contract migrations so the previous Worker remains compatible during rollback.

Production uses a 10% Cloudflare Worker canary followed by dependency-aware health assurance. A failed deployment automatically restores the previous Worker version. Code rollback does not roll back data; Neon point-in-time restore or a recovery branch is the data recovery path.

## Authentication and security

The independent deployment uses its own Neon Auth service and environment-unique cookie secret. Sites-injected ChatGPT identity headers are not trusted in production. Self-registration is disabled; practice administrators provision accounts and Clarity's existing tenant and role checks remain authoritative after authentication.

State-changing API calls enforce same-origin browser provenance, API responses are non-cacheable, errors are structured without customer data, and each response receives a request ID. Cloudflare Workers Logs is enabled for every environment with reduced production sampling.

## Required GitHub Environment configuration

Create `dev`, `test`, `preprod` and `production` environments. Require reviewers for preprod and production. Configure each with unique values:

- secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_HYPERDRIVE_ID`, `NEON_DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`
- variable: `PUBLIC_SITE_URL`

Configure the repository variable `PRODUCTION_SITE_URL` for the independent production monitor. Tokens must be least privilege and scoped only to Clarity's resources.

## First provisioning

1. Choose and record the Clarity Neon region and recovery window.
2. Create one Clarity Neon project and four persistent environment branches (or separate projects if the required isolation policy demands it).
3. Create a database role per environment. Keep migration credentials in GitHub only; create a separate least-privilege runtime role for each Hyperdrive.
4. Enable and configure Neon Auth independently per environment with only that environment's HTTPS origin.
5. Create the four R2 buckets in `deployment/environments.json`.
6. Create four Hyperdrive configurations using each Neon branch's **unpooled** connection string.
7. Create the four GitHub Environments and protection rules.
8. Run the dev deployment, exercise the tenant isolation and authentication smoke tests, then promote the unchanged SHA in order.

Do not provision production until ownership of the domain, Neon region, retention period, backup evidence owner, incident contacts and production approvers is recorded.

