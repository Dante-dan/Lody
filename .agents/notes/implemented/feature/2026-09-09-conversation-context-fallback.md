# Conversation context fallback and editable pasted files

Status: implemented
Translation: pending

## Abstract

Provider-native forking cannot move every conversation to every destination. The
fork menu now offers copying a precise Markdown history prefix independently of
native fork capability. Pasting more than 5000 characters creates an editable file
draft, uploaded on send and delivered through the existing ACP Resource Link
path. This replaces the previous 1024-character visual fold that expanded back to
full text at submission; it does not guarantee bounded subsequent model reads.

## Decisions and ownership

[The draft Spec](../../../../specs/conversation-context-copy-and-text-attachments.md)
defines the boundary. Message actions share the copy callback through the existing
conversation action context; earlier turns and unsupported ACP providers do not
inherit native-fork restrictions. A pure history-range helper rejects a missing
boundary. Existing Markdown serialization and omission notices remain in use,
with explicit references for omitted attachment bytes.

The composer retains pasted-text identity and editing, but emits a small file-name
reference instead of expanding full content into the prompt. The shared
`use-pasted-text-attachments` hook transfers the edited bytes at send for landing,
session, and edit/resend. Existing attachment transport owns CLI download and ACP
Resource Link delivery. Landing uses the existing submission lifetime hook to lock
before upload and retire stale submissions. Edit/resend reuses ChatComposer.

A single 5000-character threshold avoids an intermediate visual state whose text
expands at send. Higher 30000/60000 thresholds and a separate 1024-character folding
tier were considered; manual conversion in both directions retains control
without per-model token estimates. No new wire fields or backend are introduced.

## Verification and limits

Synthetic tests cover inclusive copy range, unsupported-fork menus, exact edited
file bytes, local/cloud routing and failures, and mention offsets. Existing
composer focus and submission feedback tests pass. Full checks are blocked by
missing runtime submodules and dependency declarations in this checkout; no clean
build or live provider round trip is claimed. No PR has been created.

The ordinary CLI attachment download failure still yields an unavailable-file
notice; making that later failure fatal is a separate lifecycle decision.
Renderer upload failure already prevents submission and preserves the draft.
Drafts retain their existing in-memory lifetime, so app restart can lose unsent
content. Submitted files are not mutated by the draft editor.
