# Shared history storage

New history metadata strings are primitive Loro values; declared streaming text,
plan markdown, tool text/output and script output remain LoroText. This insertion
policy never migrates stored data. Existing inferred/Any and declared Text string
fields keep their actual Text or primitive shape when edited, including their
Text container IDs. The pinned Mirror patch and history-string-storage tests
enforce this compatibility boundary. Keep old-reader, snapshot and concurrent
update tests when changing the schema or Mirror version.
