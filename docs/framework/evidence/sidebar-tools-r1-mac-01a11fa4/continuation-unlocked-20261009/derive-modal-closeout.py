"""Derive scoped results from existing raw evidence; never manufacture native input."""
import datetime
import hashlib
import json
from pathlib import Path

here = Path(__file__).resolve().parent
read = lambda name: json.loads((here / name).read_text())
write = lambda name, value: (here / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
note = '中文最终验收：关闭重开与浏览器重启后保留。'
old = 'native-confirm-cc733-shortpath/'
new = 'native-modal-a312/'
storage = lambda receipt: next(o['state']['tools'] for o in receipt['observations'] if o['target']['type'] == 'service_worker')
data_key = 'opendesk.sidebar-tools.data.v1:quick-notes'
catalog_key = 'opendesk.sidebar-tools.installed.v1'

before = read(old + 'task-open-before.json')['database']
after = read(old + 'task-open-after.json')['database']
assert all(before[key] == after[key] for key in ['runs', 'results'])
records = []
for filename, run_id, result_id, state in [
    ('installed-task-completed.json', 'dea2fd59-496e-4429-874f-dda9335a7d0c', '5693b238-418a-4763-b195-6c0c135650e6', 'completed'),
    ('installed-task-stopped.json', 'f888f479-998b-46f0-96fd-ae7afcc215b8', 'dc632b47-7d5f-4003-923b-4d3ba860c36b', 'stopped'),
]:
    database = read(old + filename)['database']
    run = next(x for x in database['runs'] if x.get('runId') == run_id)
    result = next(x for x in database['results'] if x.get('resultId') == result_id)
    assert run['resultId'] == result_id and result['runId'] == run_id
    assert run['state'] == result['state'] == state
    assert run['retirementState'] == 'released' and run['workerRetired'] is True
    assert result['revision']['revision'] == 1
    assert result['revision']['sourceHash'] == run['contentHash'] == 'fd551cadbf57486078e1d6dafebb5d889155c66e39978d529712d2a33e738eb5'
    records.append({'runId': run_id, 'resultId': result_id, 'state': state, 'retirementState': run['retirementState'], 'resultRevision': result['revision']})
layouts = {}
for width in [320, 200]:
    receipt = read(old + f'layout-{width}.json')
    assert receipt['status'] == 'NATIVE_PASS'
    assert receipt['state']['host']['width'] == receipt['state']['host']['scrollWidth'] == width
    layouts[str(width)] = receipt['state']
cancelled = storage(read(old + 'cancelled-data-retained.json'))
assert cancelled[data_key]['note'] == note
assert any(x['id'] == 'quick-notes' for x in cancelled[catalog_key])
dialogs = []
for path in sorted((here / old).glob('native-dialog-*.json')):
    receipt = json.loads(path.read_text())
    assert receipt['status'] == 'NATIVE_PASS'
    assert len(receipt['events']) == len(receipt['opening']) == len(receipt['closed']) == 1
    assert receipt['events'][0]['isTrusted'] and receipt['events'][0]['matched']
    opened, closed = receipt['opening'][0], receipt['closed'][0]
    elapsed = (datetime.datetime.fromisoformat(closed['at'].replace('Z', '+00:00')) - datetime.datetime.fromisoformat(opened['at'].replace('Z', '+00:00'))).total_seconds()
    dialogs.append({'path': str(path.relative_to(here)), 'accepted': closed['params']['result'], 'secondsOpen': elapsed})
assert any(not x['accepted'] and x['secondsOpen'] > 15 for x in dialogs)
for name in ['security.json', 'navigation-security.json', 'windows-navigation-offline.json', 'cycles-20.json']:
    assert read(old + name)['status'] == 'NATIVE_PASS'
assert read(old + 'cleanup.json')['cleanupStatus'] == 'PASS'
write('cc733-native-derived-verdict.json', {
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceCommit': 'cc73373bf3d6fd5d0c2b4dc3f9713bdbbc0c1452',
    'packageHash': read(old + 'session.json')['package']['packageHash'],
    'status': 'NATIVE_PASS', 'scope': 'Enumerated observations on cc733 package only; not final current-main acceptance',
    'taskOpenWithoutExecution': {'runsAndResultsUnchanged': True}, 'installedTaskResults': records,
    'layouts': layouts, 'width320Condition': 'Actual native 400px panel and Chrome 125% default zoom; host320/tool283/DPR2.5; no viewport emulation',
    'zoom200Condition': 'Actual Chrome default200%; host200/tool162/DPR4; not OS zoom',
    'dialogObservations': dialogs, 'cancelRetainedCatalogAndChineseData': True,
    'limits': ['CDP dialog receipts alone do not identify the modal control input actor; original CUA attribution claims are narrowed here',
               'Earlier 15-second timeout failure is preserved, not rewritten',
               'Delayed onChanged and Chrome storage backend I/O races remain NATIVE_NOT_VERIFIED',
               'No promotion to a312 or newer production package, full F3 or ZIP'],
})

selected = read(new + 'selected-no-install.json')
installed = read(new + 'installed-unopened.json')
saved = read(new + 'saved-native-note.json')
assert not any(x['id'] == 'quick-notes' for x in storage(selected).get(catalog_key, []))
for receipt in [selected, installed]:
    host = next(o['state'] for o in receipt['observations'] if '/ui/tool.html?' in o['target']['url'] and 'state' in o)
    assert host['iframeCount'] == 0
assert any(x['id'] == 'quick-notes' for x in storage(installed)[catalog_key])
assert storage(saved)[data_key]['note'] == note
tool = next(o['state'] for o in saved['observations'] if o['target']['type'] == 'iframe' and 'state' in o)
assert all(tool['chromeApis'][key] == 'undefined' for key in ['runtime', 'tabs', 'storage'])
assert any(i['complete'] and i['naturalWidth'] == 1 for i in tool['images'])
unexpected = read(new + 'unanticipated-confirm-result.json')
assert data_key not in storage(unexpected)
assert not any(x['id'] == 'quick-notes' for x in storage(unexpected)[catalog_key])
failed = [json.loads(p.read_text()) for p in (here / new).glob('observer-failed-*.json')]
modal_failure = next(d for d in failed if d['mode'] == 'click-dialog')
events = [e for e in modal_failure['trace'] if e.get('phase') == 'event']
assert events[-1]['params']['result'] is True
assert read(new + 'cleanup.json')['cleanupStatus'] == 'PASS'
write('a312-native-derived-verdict.json', {
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceCommit': 'a3126ee9a3165607365d9ad9f30d09de83db78ab',
    'packageHash': saved['session']['package']['packageHash'], 'status': 'NATIVE_NOT_VERIFIED',
    'scopedPasses': ['File selection does not install or execute', 'Explicit installation does not open iframe',
                    'Native Chinese save, UI/CSS/local PNG and sandbox privileged APIs unavailable'],
    'failure': {'status': 'FAILED', 'case': 'Expected cancellation of actual uninstall confirmation',
                'observed': 'Actual browser returned accepted=true before this chat clicked Cancel; tool catalog and namespace deleted',
                'actor': 'NOT_VERIFIED; no assumption about which process accepted the dialog', 'events': events},
    'cleanupStatus': 'PASS', 'sharedPortOwner': 'Other process, reused read-only and not stopped',
    'limits': ['No current candidate cancel/uninstall confirmation PASS', 'No full current candidate security/lifecycle/layout/framework closure',
               'Current shared dist/production remains f462; isolated a312 production was tested but not delivered over other owner resources'],
})
print('Scoped cc733 observations verified; current a312 remains NATIVE_NOT_VERIFIED with preserved FAILED confirmation')
