# Independent examination control framework

## Regulatory workflow

The system maps one controlled work-programme section to each of the 13 Charity Commission Directions:

| Direction | Control outcome | Blocking gate |
|---|---|---|
| 1 | Eligibility and accounting basis established | Engagement cannot proceed where an audit is required |
| 2 | Independence, competence and qualification documented | Acceptance requires examiner approval |
| 3 | Approach and evidence retained | Applicable work cannot be signed without a conclusion |
| 4 | Proportionate plan based on charity-specific risk | Fieldwork requires approved planning |
| 5 | Adequacy of accounting records assessed | Exceptions flow to findings and reporting |
| 6 | Accounts agreed to underlying records | Differences require resolution or report evaluation |
| 7 | Related-party disclosures checked for accruals accounts | Not-applicable status requires recorded rationale |
| 8 | Policies, estimates, judgements and funds assessed | Significant judgements require explicit conclusion |
| 9 | Financial circumstances and going concern considered | Completion requires trustee assessment evidence |
| 10 | Statutory form and content checked | Departures remain open findings until resolved |
| 11 | Analytical review completed and anomalies followed up | Unresolved anomalies block completion |
| 12 | Trustees' annual report compared with accounts | Material inconsistencies require resolution |
| 13 | Legally compliant report prepared and signed | Signature follows trustee approval and all preceding gates |

## Sign-off model

- Preparation and review are separate assertions, time-stamped and linked to a content hash.
- A reviewer cannot clear their own review note without an authorised override that is itself audited.
- Editing a signed workpaper invalidates the affected sign-off and creates a new version.
- The final examiner signature is personal to the appointed examiner.
- Report wording is generated from approved templates but remains subject to professional judgement.

## Regulatory reporting

A dedicated completion assessment records whether information indicates:

- a statutory matter of material significance requiring prompt direct reporting to the Charity Commission;
- another relevant matter that the examiner decides to report using the discretionary power;
- a serious incident for which trustees retain primary reporting responsibility;
- a matter requiring disclosure in the independent examiner's report to enable proper understanding of the accounts.

The workflow records the judgement, consultation, reporting date and evidence. It must never delay a legally required regulator report until engagement completion.

## Evidence and review

Every document is linked to its request, workpaper and engagement. The production service must calculate a SHA-256 digest, quarantine pending malware screening, preserve version history and restrict access to assigned users. Comments provide collaboration; formal review notes provide accountable challenge, response and clearance.
