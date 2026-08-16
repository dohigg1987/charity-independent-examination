# Secure communications low-level design

## Data model

- `conversation_threads` owns engagement and optional evidence-request linkage, subject, category, priority, workflow state, practitioner owner and resolution metadata.
- `conversation_participants` records the practice or client identity, notification preference and user-specific last-read timestamp. The `(thread_id, email)` key is unique.
- `conversation_messages` stores immutable authored messages, optional same-thread reply linkage, participant type, delivery state and creation time.
- `documents.conversation_thread_id` and `documents.conversation_message_id` associate verified object-storage records with the correct conversation and message.
- One evidence request can link to no more than one conversation.

## State transitions

| Event | Resulting state | Required evidence |
| --- | --- | --- |
| Practitioner sends | `WAITING_CLIENT` | Persisted message and audit event |
| Client sends | `WAITING_PRACTICE` | Persisted message and audit event |
| Practitioner resolves | `RESOLVED` | Resolution summary, resolver and timestamp |
| Practitioner reopens | `OPEN` | Reopening reason and timestamped system entry |

Resolved conversations reject messages and uploads. Sending, assignment and closure are server decisions, not client-side display states.

## Authorisation

- Internal practice roles may read authorised practice state and send messages. Only internal users may assign, prioritise, resolve or reopen a thread.
- Portal contributors and portal administrators may create and reply within clients listed in their authenticated memberships.
- Read-only portal roles may view authorised conversations but cannot write.
- Thread access is resolved through its engagement and client. File access repeats the client check and requires request or conversation linkage for client identities.

## Attachment transaction

1. The client selects one supported file of no more than 25 MB.
2. The upload endpoint verifies extension, MIME signature, engagement, participant authority and open-thread state.
3. The object is stored with SHA-256 and security metadata. A pending document row is returned.
4. Message creation validates ownership of the pending document, commits the message and links the document to its message.
5. The shared state is reloaded before success is presented.

## Interface structure

The practitioner application uses an inbox, message stream and context panel. The context panel holds linked-request data, owner, priority and controlled resolution. The client portal uses the same thread and message records through a simplified inbox and message stream. Mobile layouts switch from the list to a single selected thread with an explicit back action.

## Audit events

- `CONVERSATION_CREATED`
- `CONVERSATION_MESSAGE_SENT`
- `CONVERSATION_READ`
- `CONVERSATION_UPDATED`
- `CONVERSATION_RESOLVED`
- `DOCUMENT_UPLOADED`
- `DOCUMENT_DOWNLOADED`

## Failure behaviour

Validation, authorisation, locked-file, resolved-thread, attachment and stale identity failures return controlled errors. The composer retains unsent content when a request fails. Success messaging occurs only after the server returns committed application state.
