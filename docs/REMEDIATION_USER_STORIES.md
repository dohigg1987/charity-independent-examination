# Clarity IE remediation user stories

## Release objective

This release converts the recently added administration, jurisdiction, governance and concern features from interface-level demonstrations into complete, persistent and controlled workflows. Every story below has an observable acceptance criterion and a corresponding automated or interaction test.

## Epic A: concern assessment and resolution

### US-A01: use a single concerns register

As an engagement team member, I need a dedicated concerns register for the selected annual file so that every anomaly raised from a procedure, analytical review or examiner judgement can be found, filtered and followed through to conclusion.

Acceptance criteria:

1. The main navigation exposes a Findings & concerns workspace.
2. The register is restricted to the selected engagement and can be filtered by status, severity, category and free text.
3. Each row displays source, owner, age, status, reporting assessment and last activity.
4. Open, in-progress, review-ready, closed and reopened concerns remain visible.
5. A concern raised from a procedure or TB analytic retains a direct source reference.

### US-A02: create and maintain a concern

As an examiner or preparer, I need to record the nature, significance, ownership and proposed response to a concern so that the file explains why additional work is required.

Acceptance criteria:

1. A concern can be created manually or generated once from a procedure or analytic exception.
2. Title, description, category, severity and owner are required before submission for review.
3. Draft changes persist after navigation and reload.
4. Duplicate escalation of the same source updates the existing concern rather than creating another record.
5. Every material field change creates an immutable activity event.

### US-A03: add information and evidence

As an engagement team member, I need to add enquiries, management responses, examiner assessments and supporting files so that the resolution is supported by a complete evidential chain.

Acceptance criteria:

1. The concern timeline accepts typed updates classified as information, management response, examiner assessment or review note.
2. Each update records author and timestamp and cannot be overwritten.
3. Documents can be uploaded directly to the concern and retain file hash, validation status, uploader and timestamp.
4. Concern evidence is inaccessible to client users unless separately issued through an authorised client request.
5. The annual file cannot be locked while a concern has incomplete review requirements.

### US-A04: submit a concern for review

As a preparer or examiner, I need to document targeted work, management response, examiner conclusion and reporting assessment before review so that closure is based on explicit professional judgement.

Acceptance criteria:

1. Submission requires targeted work, an examiner conclusion and one reporting assessment.
2. Reporting assessments are limited to: no report effect, accounting-records concern, accounts-compliance concern, other matter, or matter of material significance.
3. Submission changes the status to READY_FOR_REVIEW and records a content snapshot hash.
4. Submitted fields become read-only until further work is requested or the concern is reopened.
5. A reviewer can see all evidence, updates and the exact submitted assessment in one workspace.

### US-A05: review and close a concern

As a reviewer or independent examiner, I need to accept the assessment or request further work so that concerns are closed only after a documented review decision.

Acceptance criteria:

1. The reviewer can choose CLOSE or FURTHER_WORK_REQUIRED and must enter a review conclusion.
2. CLOSE records reviewer, timestamp and immutable snapshot and changes the status to CLOSED.
3. FURTHER_WORK_REQUIRED returns the status to IN_PROGRESS and appends the review conclusion to the timeline.
4. Where the practice policy requires independent concern review, the concern creator cannot close it.
5. Legacy RESOLVED concerns are treated as closed but remain distinguishable in history.

### US-A06: reopen a closed concern

As an authorised reviewer, I need to reopen a closed concern with a reason so that subsequent evidence or changed circumstances can be addressed without erasing the original conclusion.

Acceptance criteria:

1. Reopening requires a reason and changes the status to REOPENED.
2. The original closure details remain immutable.
3. Reopening clears the current review-ready state but does not delete prior evidence or activity.
4. Reporting and file lock gates immediately become incomplete.

### US-A07: connect concerns to the examiner's conclusion

As the independent examiner, I need the reporting screen to summarise the effect of closed concerns so that the selected negative-assurance conclusion is consistent with the file.

Acceptance criteria:

1. Reporting displays closed concerns grouped by reporting assessment.
2. UNMODIFIED cannot be selected when any closed concern has a report effect.
3. A modified conclusion cannot be selected without at least one matching closed concern.
4. Open, in-progress, reopened or review-ready concerns block report generation and file lock.
5. The generated report includes the controlled wording and the relevant closed concern summaries.

## Epic B: jurisdiction and rule administration

### US-B01: maintain jurisdiction profiles

As a practice administrator, I need to maintain regulator identity, official source and active status so that engagement routing uses controlled master data.

Acceptance criteria:

1. Changes persist after reload and record updater and timestamp.
2. Only HTTPS regulator sources are accepted.
3. A jurisdiction cannot be deactivated while it has an active engagement.
4. The overview identifies jurisdictions without an effective published rule.

### US-B02: create a rule draft safely

As a practice administrator, I need to create a new draft from a chosen published version so that regulatory updates start from an explicit baseline.

Acceptance criteria:

1. Draft creation requires a unique version and effective-from date.
2. The administrator chooses the source version; the system does not silently use the first record returned.
3. A draft cannot default to a date that overlaps an existing regime without an explicit validation warning.
4. Draft changes persist and remain editable until publication.

### US-B03: publish a complete rule version

As a practice administrator, I need publication to save the visible form values and validate the complete effective-dated series atomically so that the published record matches what was reviewed.

Acceptance criteria:

1. Publish saves current unsaved form values before validation.
2. Publication rejects duplicate versions, invalid dates, overlapping periods and incomplete official-source information.
3. Where the new version succeeds an open-ended version, the predecessor closes on the day before the new effective date in the same controlled operation.
4. Published records are immutable.
5. Engagements already pinned to an older version retain it.

### US-B04: inspect rule use and coverage

As a practice administrator, I need to see current, future and historical versions and their engagement usage so that changes can be assessed before publication.

Acceptance criteria:

1. Versions are sorted deterministically by effective date and version.
2. The interface identifies current, future, historical and draft states.
3. It displays the number of engagements pinned to each version.
4. Coverage gaps and overlaps are reported as configuration exceptions.

## Epic C: organisation types, access and quality controls

### US-C01: maintain organisation types

As a practice administrator, I need to add, rename and deactivate organisation types so that client master data remains controlled over time.

Acceptance criteria:

1. New records receive a unique stable code and appear without reloading.
2. Empty, duplicate or invalid names are rejected with an inline message.
3. Existing client records retain their stored classification after a type is deactivated.
4. Active and inactive records can be filtered.

### US-C02: maintain practice access

As a practice administrator, I need to create and update practice users and roles so that application permissions are explicit and auditable.

Acceptance criteria:

1. Email addresses are unique case-insensitively.
2. Roles and statuses use controlled values.
3. An administrator cannot deactivate their own account or the last active administrator.
4. Each change records an audit event and the interface shows success or failure beside the affected row.

### US-C03: configure quality policy

As a practice administrator, I need effective practice-level quality settings so that workflow controls reflect the firm's operating model rather than static explanatory cards.

Acceptance criteria:

1. The quality tab edits a persistent settings record.
2. Settings cover concern review mode, independent concern closure, procedure self-review, lock deadline, retention period and default engagement quality review.
3. Values are validated server-side and changes are audited.
4. Workflow gates consume the current policy without altering locked historical files.

## Epic D: governance register reliability

### US-D01: maintain trustees and officers

As a practice administrator, I need to create and edit trustee, officer and dual-capacity records, including cessation dates, so that the permanent file contains current and historical officeholders.

Acceptance criteria:

1. Create and edit both persist after reload.
2. Inactive records require a cessation date, and cessation cannot precede appointment.
3. Active records cannot carry a cessation date.
4. Counts and filters distinguish trustees, officers, dual-capacity people, current holders and leavers.
5. Historical records are never removed by editing.

## Non-functional acceptance criteria

1. All actions enforce authentication, engagement/client authorisation and role permission on the server.
2. State changes use controlled enums and server-side validation.
3. The desktop, tablet and mobile interfaces remain usable with keyboard navigation and visible focus.
4. All forms display pending, success and error states without relying solely on a disappearing toast.
5. Type checking, linting, unit tests, workflow tests, production build, artifact validation and dependency audit pass.
6. End-to-end interaction tests cover every critical create, update, submit, review, close, reopen, publish and reload journey.

