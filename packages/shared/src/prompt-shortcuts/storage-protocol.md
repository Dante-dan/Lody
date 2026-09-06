# Prompt Shortcut local storage and publication

Local authoring is authoritative for the working copy. Optional cloud publication
may fail or remain pending indefinitely without blocking another save or delete.

## Durable state

- The local ledger holds desired state, the last acknowledged publication cursor,
  and an immutable in-flight job as separate records. It also caches the last
  authorized directory and discovered index projections. It NEVER joins Streams.
- Save validates, persists a pointer-only write intent, persists the working LoroDoc,
  persists its projection/outbox, then clears the intent. Recovery reads only journaled
  bodies: finish a post-body save; discard a pre-body intent. The intent's base is
  the local parent revision, not the remotely published revision.
- Every job freezes current state into a separate, fresh LoroDoc before any cloud
  call. Mutable working documents never enter the cloud resource transport. Editing
  newer remote state first forks it into a local working body.
- A one-time v1 ledger upgrade recovers old intents and preserves pending jobs'
  exact remote identities while forking their working bodies. Each row transition
  is atomic and replayable; never clear unsynced data to upgrade.

## Publication

The runtime owns stage → body upload → empty index preparation → activation CAS →
index projection → old-domain withdrawal. Preparing an empty index cannot expose
staged labels or scope. A live Flock subscription closes the activation-before-index
append race without preloading bodies.

A late acknowledgement advances only the publication cursor. It clears pending
state only if the desired local head still matches that job. New edits otherwise
remain pending and immediately drain after the older job finishes.

When superseding an ambiguous job, atomically settle it remotely: cancel/fence a
staged job (including a stage request not yet received), or finish an already-active
job before advancing the cursor. Never infer cancellation from a query returning
no active row. Delete supersedes jobs and fences even never-staged creation.

## Offline access and shutdown

Owned working copies and previously authorized downloaded shared bodies work after
offline restart. Only a cache miss needs a read-only body grant. Learned revocation
is persisted and hides shared cache; immediate revocation on an offline device is
impossible. Explicit owner deletion tombstones, not missing/stale query rows, hide
clean owned replicas. Dirty conflicts retain local work.

`ShortcutLifetime` stops waiting on optional cloud mutations/grants when the owner
closes. This lets local storage close and reopen even if an offline cloud SDK queues
the request indefinitely. It consumes late replies without resuming the old caller,
but cannot undo server effects. Recovery still needs the immutable job identity.
