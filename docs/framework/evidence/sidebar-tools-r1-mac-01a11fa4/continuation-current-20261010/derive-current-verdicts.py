"""Derive scoped verdicts from preserved receipts, without browser mutation."""
import datetime
import hashlib
import json
from pathlib import Path

directory = Path(__file__).parent / 'native-final-e3ed'
read = lambda name: json.loads((directory / (name + '.json')).read_text())
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
session = read('session')
package_hash = session['package']['packageHash']
note = '中文最终验收：关闭重开与浏览器重启后保留。'
data_key = 'opendesk.sidebar-tools.data.v1:quick-notes'
installed_key = 'opendesk.sidebar-tools.installed.v1'

def save(name, **record):
    destination = directory / (name + '.json')
    assert not destination.exists(), 'Never overwrite a prior verdict'
    destination.write_text(json.dumps(dict(at=now(), status='NATIVE_PASS',
        sourceCommit='e3ed1a1e55d179588f259640129f6ad492d600ff',
        packageHash=package_hash, **record), ensure_ascii=False, indent=2) + '\n')

before, after = read('note-saved'), read('after-whole-browser-restart')
restart = read('launcher-tools-r1-restart-verified')
assert before['storage'] == after['storage']
assert after['tool']['note'] == note
assert restart['restartObserved']['sameProfile'] is True
assert restart['restartObserved']['previousPidAlive'] is False
assert restart['pid'] != restart['previousPid']
save('restart-durability-verdict', inputs=['note-saved.json',
    'after-whole-browser-restart.json', 'launcher-tools-r1-restart-verified.json'],
    scope='Whole-process restart, same private profile inode, Chinese note and installed package restored; cleanup is a separate check')

before, after = read('jump-before'), read('jump-after')
assert before['database'] == after['database']
assert read('task-jump-sidepanel')['ui']['taskSelection'] == 'sample.sidebar-tool-r1-readonly'
database = read('installed-stopped')['database']
records = []
for run in database['runs']:
    if run.get('scriptId') != 'task:sample.sidebar-tool-r1-readonly:1.0.0':
        continue
    result = next(r for r in database['results'] if r['resultId'] == run['resultId'])
    assert result['tag'] == 'controller-result'
    assert result['runId'] == run['runId']
    assert result['state'] == run['state']
    assert result['revision'] == run['revision']
    assert result['revision']['revision'] == 1
    assert run['retirementState'] == 'released'
    records.append({k: run[k] for k in ['runId', 'resultId', 'state', 'retirementState', 'revision']})
assert {r['state'] for r in records} == {'completed', 'stopped'}
observations = read('native-save-and-task-jump')['pages']
saves = [e for p in observations for e in p['observation'].get('uiInputs', [])
         if e.get('id') == 'script-save']
assert len(saves) == 1 and saves[0]['isTrusted'] is True
assert saves[0]['params'] == '{"value":0}' and saves[0]['scriptId'] == 'my-script'
source_hash = hashlib.sha256(saves[0]['source'].encode()).hexdigest()
assert all(r['revision']['sourceHash'] == source_hash for r in records)
assert read('task-history-open')['ui']['taskHistoryVisible'] is True
save('task-v1-verdict', records=records, saveInput=saves[0],
    inputs=['jump-before.json', 'jump-after.json', 'task-jump-sidepanel.json',
        'installed-completed.json', 'installed-stopped.json', 'task-history-open.json',
        'native-save-and-task-jump.json'],
    scope='Actual Task v1 install, tool jump without execution, Run/Stop/result/history; no final framework F3 claim')

def version(record):
    return next(t['version'] for t in record['storage'][installed_key] if t['id'] == 'quick-notes')

old, updated = read('before-update'), read('update-opened')
assert version(old) == '1.0.0' and version(updated) == '1.0.1'
assert old['storage'][data_key] == updated['storage'][data_key] == {'note': note}
assert read('update-selected')['ui']['frames'] == 0
selected, cancelled, accepted = read('restore-selected'), read('restore-cancelled'), read('restore-accepted')
assert selected['storage'] == cancelled['storage']
assert version(cancelled) == '1.0.2' and version(accepted) == '1.0.3'
assert accepted['storage'][data_key] == {'note': note}
assert cancelled['ui']['frames'] == accepted['ui']['frames'] == 0
dialog_inputs = []
for name, expected, cua_time in [
    ('restore-cancel-dialog', False, '2026-10-09T19:10:00.072Z'),
    ('restore-accept-dialog', True, '2026-10-09T19:10:40.318Z')]:
    receipt = read(name)
    opened = [e for e in receipt['events'] if e['method'] == 'Page.javascriptDialogOpening']
    closed = [e for e in receipt['events'] if e['method'] == 'Page.javascriptDialogClosed']
    assert len(opened) == len(closed) == 1
    assert opened[0]['params']['type'] == 'confirm'
    assert closed[0]['params']['result'] is expected
    dialog_inputs.append(dict(receipt=name + '.json', result=expected,
        cuaActionAt=cua_time, provenance='Actual CUA cancel/confirm button action recorded in this chat; Page observer was read-only'))
save('update-and-consent-verdict', dialogInputs=dialog_inputs,
    inputs=['before-update.json', 'update-selected.json', 'update-opened.json',
        'capability-revocation.json', 'restore-selected.json', 'restore-cancelled.json',
        'restore-accepted.json', 'after-restored-update.json'],
    scope='Update preserves notes; capability revocation blocks calls; explicit capability expansion consent; selection/update does not execute tool')
print('Three scoped verdicts derived from preserved receipts; latest main package is a separate identity.')
