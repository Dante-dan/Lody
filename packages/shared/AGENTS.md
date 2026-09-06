# Shared history storage

New history metadata strings are primitive Loro values; declared streaming text,
plan markdown, tool text/output and script output remain LoroText. This insertion
policy never migrates stored data. Existing inferred/Any and declared Text string
fields keep their actual Text or primitive shape when edited, including their
Text container IDs. The pinned Mirror patch and history-string-storage tests
enforce this compatibility boundary. Keep old-reader, snapshot and concurrent
update tests when changing the schema or Mirror version.

History payload storage hints (`Any.storageSchema` in the pinned Mirror patch)
select container layouts without tightening the legacy payload validation
contract. Resolve hints against the actual value on insertion and diff; an
incompatible legacy Map/Text must keep its container identity when edited.
This is not a write whitelist: unknown-field filtering, invalid-update
preservation/diagnostics and inline-image removal remain separate work. Never
sanitize persisted history on open to satisfy a newer schema.
