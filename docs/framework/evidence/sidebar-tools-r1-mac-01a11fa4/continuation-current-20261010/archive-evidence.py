"""Extend the raw evidence inventory without altering prior receipt bytes."""
import datetime
import hashlib
import json
from pathlib import Path

base = Path(__file__).parent.parent
index_path = base / 'evidence-index.json'
old_bytes = index_path.read_bytes()
old = json.loads(old_bytes)
for entry in old['files']:
    raw = (base / entry['path']).read_bytes()
    assert len(raw) == entry['bytes'], entry['path']
    assert hashlib.sha256(raw).hexdigest() == entry['sha256'], entry['path']
prior = Path(__file__).parent / 'prior-evidence-index.json'
assert not prior.exists(), 'Do not overwrite prior index'
prior.write_bytes(old_bytes)
rows, invalid_json = [], []
valid_json = 0
for path in sorted(base.rglob('*')):
    if not path.is_file() or path == index_path:
        continue
    assert not path.is_symlink(), path
    if path.name in ['.DS_Store', 'other-staged-before-source-commit.patch']:
        continue
    data = path.read_bytes()
    relative = str(path.relative_to(base))
    rows.append(dict(path=relative, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    if path.suffix == '.json':
        try:
            json.loads(data)
            valid_json += 1
        except (ValueError, UnicodeError) as error:
            invalid_json.append(dict(path=relative, error=str(error)))
checkpoint = json.loads((Path(__file__).parent / 'checkpoint.json').read_text())
record = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    sourceCommit=checkpoint['sourceCommit'],
    productionPackageHash=checkpoint['latestProduct']['packageHash'],
    nativeStatus='NATIVE_NOT_VERIFIED',
    scope='Current main component CI and bounded earlier native receipts. Latest main Native incomplete because Mac is locked; no final F3/ZIP claim.',
    priorIndex=str(prior.relative_to(base)),
    priorEntriesVerified=len(old['files']),
    latestCheckpoint='continuation-current-20261010/checkpoint.json',
    historicalMetadata={k:v for k,v in old.items() if k != 'files'},
    excludedLocalFiles=old['excludedLocalFiles'], files=rows,
    fileCount=len(rows), totalBytes=sum(row['bytes'] for row in rows),
    validJsonFiles=valid_json, invalidJsonFiles=invalid_json)
index_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k:record[k] for k in ['fileCount','totalBytes','validJsonFiles','invalidJsonFiles','priorEntriesVerified']},ensure_ascii=False))
