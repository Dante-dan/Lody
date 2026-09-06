#!/usr/bin/env python3
"""Validate local conversation items with the closed candidate write schema.

SQLite is read-only. Each document runs in a fresh Node process. Only anonymous
counts and field paths are retained; the private binary frames are removed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import struct
import subprocess
import tempfile
import time


def connect(db):
    connection = sqlite3.connect('file:' + str(db) + '?mode=ro', uri=True)
    connection.execute('pragma query_only=on')
    connection.execute('begin')
    return connection


def inventory(root):
    databases = sorted(root.rglob('repo.sqlite3'))
    replicas = []
    query = '''
      with u as (
        select doc_id, sum(length(update_data)) as b from doc_updates group by doc_id
      ), ids as (select doc_id from docs union select doc_id from doc_updates)
      select ids.doc_id, coalesce(length(d.snapshot),0) + coalesce(u.b,0)
      from ids left join docs d on ids.doc_id=d.doc_id
      left join u on ids.doc_id=u.doc_id
    '''
    for db in databases:
        connection = connect(db)
        try:
            replicas.extend({'db': db, 'id': key, 'bytes': size}
                            for key, size in connection.execute(query))
        finally:
            connection.close()
    return databases, replicas, sorted(replicas, key=lambda r: r['bytes'], reverse=True)


def write_frames(row, frame):
    connection = connect(row['db'])
    try:
        snapshot = connection.execute('select snapshot from docs where doc_id=?',
                                      (row['id'],)).fetchone()
        snapshot = snapshot[0] if snapshot and snapshot[0] else b''
        updates = [v[0] for v in connection.execute(
            'select update_data from doc_updates where doc_id=? order by id', (row['id'],))]
        blocks = ([snapshot] if snapshot else []) + updates
        with frame.open('wb') as output:
            output.write(struct.pack('<I', len(blocks)))
            for block in blocks:
                output.write(struct.pack('<I', len(block)))
                output.write(block)
        return len(snapshot), sum(map(len, blocks))
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / '.lody/loro-repo')
    parser.add_argument('--limit', type=int, help='Optional smoke-test conversation limit; default: all')
    parser.add_argument('--loro-package', required=True, help='Absolute installed loro-crdt module path')
    parser.add_argument('--output', type=Path, required=True, help='Private output directory')
    parser.add_argument('--storage-compat', action='store_true', help='Verify storage insertion policy instead of filtering')
    parser.add_argument('--old-storage-module', type=Path, help='Bundled baseline schema and unpatched Mirror')
    parser.add_argument('--new-storage-module', type=Path, help='Bundled current schema and patched Mirror')
    args = parser.parse_args()
    if args.storage_compat and not (args.old_storage_module and args.new_storage_module):
        parser.error('--storage-compat requires both storage modules')
    if args.limit is not None and args.limit <= 0:
        parser.error('--limit must be positive')
    os.umask(0o077)
    args.output.mkdir(parents=True, exist_ok=True)
    scripts = Path(__file__).resolve().parent
    source = scripts.parents[1] / ('packages/shared/src/schema.ts' if args.storage_compat else 'packages/shared/src/history-content-schema.ts')
    databases, replicas, ranked = inventory(args.root)
    results, failures = [], []
    workspace_aliases = {db: hashlib.sha256(str(db.relative_to(args.root)).encode()).hexdigest()[:12] for db in databases}
    workspace_scanned = {db: 0 for db in databases}
    scanned = 0
    started = time.time()
    schema_hash = hashlib.sha256(source.read_bytes()).hexdigest()

    def save():
        manifest = {
            'databases': len(databases), 'replicas': len(replicas),
            'uniqueDocuments': len({r['id'] for r in ranked}), 'scanned': scanned,
            'allReplicasScanned': scanned == len(ranked),
            'conversations': len(results), 'limit': args.limit,
            'schemaSha256': schema_hash,
            'storageCompatibility': args.storage_compat,
            'storageModuleHashes': ({name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in [('old', args.old_storage_module), ('new', args.new_storage_module)]} if args.storage_compat else None),
            'elapsedSeconds': round(time.time() - started, 2),
            'failures': failures, 'results': results,
            'workspaces': [{
                'alias': workspace_aliases[db],
                'storedDocuments': sum(row['db'] == db for row in ranked),
                'scannedDocuments': workspace_scanned[db],
                'conversations': sum(r['workspaceAlias'] == workspace_aliases[db] for r in results),
                'items': sum(r['accepted'] + r['unsupported'] + r['invalid'] for r in results if r['workspaceAlias'] == workspace_aliases[db]),
                'invalid': sum(r['invalid'] + r['invalidToolBlocks'] for r in results if r['workspaceAlias'] == workspace_aliases[db]),
                'behaviorMismatches': sum(r['questionMetadataMismatches'] + r['answerMismatches'] + int(r['schedulingMismatch']) for r in results if r['workspaceAlias'] == workspace_aliases[db]),
                'readFailures': sum(r['workspaceAlias'] == workspace_aliases[db] for r in failures),
            } for db in databases],
        }
        (args.output / 'results.json').write_text(json.dumps(manifest, indent=2))

    with tempfile.TemporaryDirectory(prefix='private-history-validation-') as temp:
        temp = Path(temp)
        subprocess.run(['node', str(scripts / 'build.mjs'), str(temp)], check=True)
        child_env = {
            **os.environ,
            'LODY_HISTORY_SCHEMA_MODULE': str(temp / 'schema.cjs'),
            'LODY_HISTORY_PERMISSION_MODULE': str(temp / 'permission.cjs'),
            'LODY_HISTORY_SCHEDULING_MODULE': str(temp / 'scheduling.cjs'),
        }
        if args.storage_compat:
            child_env.update(LODY_STORAGE_OLD_MODULE=str(args.old_storage_module.resolve()),
                             LODY_STORAGE_NEW_MODULE=str(args.new_storage_module.resolve()))
        for row in ranked:
            if args.limit is not None and len(results) >= args.limit:
                break
            scanned += 1
            workspace_scanned[row['db']] += 1
            alias = hashlib.sha256(row['id'].encode()).hexdigest()[:12]
            frame = temp / 'doc.frames'
            try:
                snapshot, stored = write_frames(row, frame)
                child = subprocess.run(
                    ['node', '--max-old-space-size=1536', str(scripts / ('analyze-storage.cjs' if args.storage_compat else 'analyze.cjs')),
                     str(frame), args.loro_package],
                    capture_output=True, text=True, timeout=90, env=child_env)
                result = json.loads(child.stdout.strip().splitlines()[-1])
                if child.returncode or result.get('failed'):
                    raise RuntimeError('analyzer failed')
                if not result['conversation']:
                    continue
                result.update(workspaceAlias=workspace_aliases[row['db']], alias=alias, rank=len(results) + 1, storedBytes=stored,
                              storedSnapshotBytes=snapshot, storedUpdateBytes=stored - snapshot)
                results.append(result)
                save()
                print(json.dumps({'completed': len(results), 'invalid': result['invalid'],
                                  'unsupported': result['unsupported']}), flush=True)
            except Exception as error:
                failures.append({'workspaceAlias': workspace_aliases[row['db']], 'alias': alias, 'errorClass': type(error).__name__})
            finally:
                frame.unlink(missing_ok=True)
    save()
    failed = bool(failures or any(
        r['schedulingMismatch'] or r['invalid'] or r['invalidToolBlocks'] or r['questionMetadataMismatches'] or r['answerMismatches']
        for r in results))
    print(json.dumps({'done': True, 'conversations': len(results), 'failed': failed}))
    return int(failed or not results)


if __name__ == '__main__':
    raise SystemExit(main())
