# Clarity IE

Clarity IE is a controlled workflow application for independent examinations of charity accounts in England and Wales. It combines portfolio management, the 13 mandatory CC32 Directions, indexed workpapers, evidence requests, reviewer notes, sign-off gates, reporting and a secure client portal.

## Current release

The initial release provides a fully navigable product interface with interactive engagement, workpaper, request, review, reporting and client-portal flows. It also includes the production PostgreSQL domain model, eligibility rules, security headers, automated tests and CI. The interface currently uses illustrative in-browser data. Authentication, persistence, object storage, notification delivery and malware scanning must be connected before operational use.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` for the examiner workspace and `http://localhost:3000/client` for the client portal.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

## Regulatory basis

The work programme reflects the Charity Commission's *Independent examination of charity accounts: Directions and guidance for examiners (CC32)*. Each engagement records the approach taken to all applicable Directions and separately assesses statutory matters of material significance and discretionary reports to the Commission. This software supports, but does not replace, the examiner's professional judgement or responsibility to verify current law, thresholds and guidance for each engagement.

Key sources:

- [CC32 directions and guidance](https://www.gov.uk/government/publications/independent-examination-of-charity-accounts-examiners-cc32)
- [Charity reporting and accounting essentials, CC15d](https://www.gov.uk/government/publications/charity-reporting-and-accounting-the-essentials-november-2016-cc15d)
- [Serious incident reporting guidance](https://www.gov.uk/guidance/how-to-report-a-serious-incident-in-your-charity)

## Architecture

- Next.js and TypeScript presentation and application layer
- PostgreSQL schema with tenant-scoped records and explicit engagement assignments
- Versioned, hash-addressed workpapers and evidence documents
- Immutable sign-off snapshots and append-only audit events
- Object-storage metadata designed for encryption, malware scanning and retention controls
- Role model covering practice owners, examiners, reviewers, team members and client users

See [docs/CONTROL-FRAMEWORK.md](docs/CONTROL-FRAMEWORK.md), [SECURITY.md](SECURITY.md) and [docs/PRODUCTION-ROADMAP.md](docs/PRODUCTION-ROADMAP.md).

## Important deployment condition

This repository must be private before it is used for live work. Client data, credentials, encryption keys and uploaded evidence must never be committed to Git.
