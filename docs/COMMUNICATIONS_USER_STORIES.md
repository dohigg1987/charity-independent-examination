# Secure communications user stories

## Product boundary

The communications capability supports controlled collaboration between a charity and its independent examiner. It is not consumer chat, general email, audit confirmation software or a replacement for formal workpapers. Messages may explain, request and evidence matters, but conclusions and sign-off remain in the relevant controlled workpaper, finding or report workflow.

## Practitioner stories

### COM-01: Manage a client inbox

As a practitioner, the user can see all engagement conversations in a searchable inbox so that new client communications are identified and allocated promptly.

Acceptance criteria:

1. The inbox filters all, unread, open and resolved conversations.
2. Each row shows subject, client contact, category, priority, last activity and unread state.
3. Selecting a conversation marks it read for the authenticated practitioner only.
4. Searches include thread subjects and message bodies within the authorised engagement.

### COM-02: Start a controlled conversation

As a practitioner, the user can create a conversation addressed to the client contact so that engagement communications are retained with the annual file.

Acceptance criteria:

1. Subject, category and initial message are required.
2. Subject and body length limits are enforced server-side.
3. The first message is committed before the interface reports success.
4. The thread is assigned to the sending practitioner and becomes `WAITING_CLIENT`.
5. The creation is written to the hash-chained audit trail.

### COM-03: Link evidence correspondence

As a practitioner, an evidence request automatically has one linked conversation so that requests, replies and attachments are not fragmented.

Acceptance criteria:

1. Creating an evidence request creates its conversation and initial message.
2. A request cannot have two communication threads.
3. The conversation shows the request reference, title, status and due date.
4. Client request replies are reflected in the shared thread.

### COM-04: Send and reply securely

As a participant, the user can send a reply, reference an earlier message and attach a validated file.

Acceptance criteria:

1. Messages support up to 10,000 characters and one validated attachment per send.
2. A reply reference must belong to the same conversation.
3. Attachments must have been uploaded by the sender to the same open thread.
4. Message delivery changes responsibility to `WAITING_CLIENT` or `WAITING_PRACTICE` according to sender.
5. The interface reports success only after the server transaction completes.

### COM-05: Own and prioritise work

As a practitioner, the user can assign an active practice owner and normal, high or urgent priority so that communications can be managed operationally.

Acceptance criteria:

1. Only active practice users can be assigned.
2. Assignment and priority are persisted and audited.
3. Client users cannot amend internal ownership or priority.

### COM-06: Resolve and reopen

As a practitioner, the user can resolve a completed conversation and reopen it when further work emerges.

Acceptance criteria:

1. Resolution requires a summary.
2. Reopening requires a reason.
3. Each decision creates a visible system entry and audit event.
4. Resolved threads reject further messages and attachments until reopened.

## Client stories

### COM-07: Use a dedicated secure inbox

As a charity contact, the user can view unread and historical engagement messages independently of the evidence-request list.

Acceptance criteria:

1. Only conversations for authorised client engagements are returned.
2. Unread status is specific to the authenticated user.
3. The full message, attachment and linked-request history is visible.
4. Read-only portal users cannot create conversations or reply.

### COM-08: Contact the examination team

As an authorised client contributor, the user can start a categorised conversation and receive a durable delivery result.

Acceptance criteria:

1. A client-created thread becomes `WAITING_PRACTICE`.
2. Priority remains a practice-controlled field.
3. The client cannot access internal comments, workpapers or unrelated attachments.

## Control stories

### COM-09: Preserve confidentiality and provenance

As the practice data owner, every thread, message and attachment is tenant-scoped, attributed and auditable.

Acceptance criteria:

1. Server-side authorisation is enforced on every read, write, upload and download.
2. Cross-client thread, message and document identifiers are rejected.
3. Files retain signature verification, SHA-256 hash and download audit events.
4. Message success is never simulated through browser-only state.
