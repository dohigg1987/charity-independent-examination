# Commercial release standard

A release is eligible for production only when every mandatory gate below passes or an accountable owner records a time-limited risk acceptance.

## Mandatory automated gates

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run build`
5. `node --test tests/rendered-html.test.mjs`
6. `npm audit` with no known vulnerabilities
7. `git diff --check`

## Mandatory functional checks

- Anonymous access is redirected to sign-in and an unregistered identity is denied.
- Each internal role is limited to its permitted administration, preparation and review actions.
- A client user sees only an assigned charity and cannot access another engagement by changing an identifier.
- A preparer cannot review their own procedure, task, trial-balance or engagement work.
- Evidence requests accept a client reply and attachment, and the same evidence appears at the linked workpaper procedure.
- Permanent-file documents and annual TB/draft-accounts documents can be uploaded and downloaded only by authorized users.
- Locking is blocked until every applicable procedure and Direction has preparation and review evidence and all review notes are cleared.
- A deployment smoke test covers one read, one write, one authorized download and one denied cross-client request.

## Mandatory governance evidence before live client data

- Approved DPIA, privacy notice, retention schedule and data-processing terms.
- Current user and client-access register with joiner, mover and leaver evidence.
- Backup configuration plus a successful restore exercise.
- Alert routing and an incident-response exercise.
- Independent penetration test with no unresolved critical or high findings.
- Documented business owner acceptance that the methodology is limited assurance and does not represent a statutory audit.

Passing the repository tests establishes software evidence only. It does not itself certify Charity Commission compliance, legal compliance or production operating effectiveness.
