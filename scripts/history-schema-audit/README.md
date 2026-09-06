# Local history schema audit

This is a read-only calibration tool for `history-content-schema.ts`, a candidate
**write projection** for `history[].items`. It does not replace the production
Mirror schema, change existing CRDTs, validate every root field, or prove that a
reader/writer rollout is compatible.

Run from the standalone repository after installing its dependencies:

```sh
python3 scripts/history-schema-audit/audit.py \
  --loro-package /absolute/path/to/installed/loro-crdt \
  --output /private/temporary/output-directory
```

Without `--limit`, it inspects every stored document replica in the local SQLite stores
and validates the items of every conversation, including empty histories. `--root` can select a
different local repository directory. Snapshot and update bytes are captured in
one read-only transaction per document, then decoded in an isolated Node process.
Every workspace is reported separately. If a document id occurs in multiple stores, each replica is validated; none is skipped in favor of a larger replica.
Temporary binary frames are deleted; no transcript text is written to the report.

The result separates:

- accepted known messages (including their projected fields);
- unsupported top-level variants, skipped independently;
- malformed known messages, reported as validation failures;
- field paths removed by projection (including deliberately removed tool blocks);
- differences in the existing question/answer reader's behavior before and after
  projection.

The command fails if any document cannot be analyzed, a known message or supported nested tool block fails,
question/answer behavior or scheduled-task derivation changes, or no conversations are found. Nested unsupported
or malformed tool blocks are filtered individually; a parent message accepted by
this write policy does not imply every original nested block was retained.

Arbitrary provider metadata is not accepted. Named dictionaries such as question
answers have explicit value types; they are not an unrestricted object escape.
Synthetic unit tests cover variants absent from the current local sample. Do not
commit local report output or use captured conversations as test fixtures.

## Image filtering and size claims

The candidate removes recognized `imageUrl.url: data:image/...` entries only from
JSON arrays inside tool text. Ordinary text and supported structured image/audio
blocks are retained. Invalid JSON, other shapes, and tool strings longer than
10,000,000 JavaScript string code units are left unchanged to bound parsing work.
This is not a general image-size limit or attachment externalization feature.

`beforeBytes` and `afterBytes` measure serialized message-item JSON before and
after the entire projection, including terminal-output removal. They do not
isolate image savings or measure SQLite size, CRDT snapshots, or retained history.
Merging this audit does not reduce production writes or shrink existing documents.

## String storage compatibility

This mode tests the production insertion-policy change independently of the
candidate filtering schema. It never projects away fields. Pass the package
directory of an **unpatched** baseline Mirror installation, so old-reader checks
exercise its actual code, not just the old schema on the new engine:

```sh
node scripts/history-schema-audit/build-storage.mjs \
  /private/temporary/storage-modules BASELINE_GIT_REF /absolute/path/to/unpatched/loro-mirror
python3 scripts/history-schema-audit/audit.py \
  --storage-compat \
  --old-storage-module /private/temporary/storage-modules/old.cjs \
  --new-storage-module /private/temporary/storage-modules/new.cjs \
  --loro-package /absolute/path/to/installed/loro-crdt \
  --output /private/temporary/storage-results
```

Every stored document is read by both schemas without creating operations.
Every conversation's message items are then rebuilt in a disposable document with
the production new-write schema (using only turn id/role/timestamp as envelope).
The audit checks exact item round trips, plain nested metadata strings, explicit
streaming Text fields, old-reader compatibility after snapshot import, old/new
update exchange, and preservation of an existing legacy title Text ID when that
shape is present. Original root/turn metadata is compared on read, not rebuilt.
No migration, SQLite update, compaction, or real document write is performed.
The unit tests cover legacy fields and stream updates even when a corpus document
has no matching tool title. Module hashes identify the exact old and new bundles.

The new runtime includes a narrow Mirror patch: for inferred/Any and declared Text map fields,
string-to-string edits retain the actual existing Text or primitive representation.
Explicit transforms and non-Text declared schemas retain their own rules.
Future upstream Mirror upgrades must retain these regression tests before removing
the patch. This does not make unpatched old writers use the new insertion policy.
