"""Strict offline checks of retained native observations; never synthesize an ack."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[4]
sha = 'f462df264afd5b1b8d32101fb36af1d63c98c8cd'
identities = json.loads((root / 'native-instance-package-identities.json').read_text())
package_hash = identities['production']['packageHash']
assert identities['sourceSha'] == sha
note = '中文最终验收：关闭重开与浏览器重启后保留。'
catalog = 'opendesk.sidebar-tools.installed.v1'
namespace = 'opendesk.sidebar-tools.data.v1:quick-notes'

def read(name):
    return json.loads((root / name).read_text())

def save(name, data):
    path = root / name
    assert not path.exists(), 'Retained receipts are immutable'
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def observed(name):
    value = read(name)
    assert value['session']['package']['packageHash'] == package_hash
    return value

def state(value, kind):
    rows = [r['state'] for r in value['observations'] if r['target']['type'] == kind and 'state' in r]
    assert len(rows) == 1
    return rows[0]

def control(value, name):
    rows = [r for r in value['controls'] if r.get('id') == name]
    assert len(rows) == 1
    return rows[0]

n = 'native-final-f462/'
selected = observed(n + 'selected-no-install.json')
installed = observed(n + 'installed-unopened.json')
assert not state(selected, 'service_worker')['tools'].get(catalog)
assert [p['id'] for p in state(installed, 'service_worker')['tools'][catalog]] == ['quick-notes']
for value in [selected, installed]:
    assert not any(r['target']['type'] == 'iframe' for r in value['observations'])
saved = state(observed(n + 'saved-native-note.json'), 'iframe')
assert control(saved, 'note-text')['value'] == note
assert 'OpenDesk Browser · Browser Test Lab' in control(saved, 'page-summary')['text']
assert 'http://127.0.0.1:43111/demo-form.html' in control(saved, 'page-summary')['text']
assert saved['images'][0]['complete'] and saved['images'][0]['naturalWidth'] == 1
assert set(saved['chromeApis'].values()) == {'undefined'}
for name in ['security', 'cycles-20', 'windows-navigation-offline', 'computation-csp']:
    receipt = read(n + name + '.json')
    assert receipt['session']['package']['packageHash'] == package_hash and receipt['status'] == 'NATIVE_PASS'
cycles = read(n + 'cycles-20.json')
assert len(cycles['measurements']) == 21 and cycles['closed']['toolFrames'] == 0
assert len({r['messageListeners'] for r in cycles['measurements']}) == 1

raw = read(n + 'draft-final-released-runs.json')
assert raw['session']['package']['packageHash'] == package_hash
db = raw['database']
runs = [r for r in db['runs'] if r.get('runId')]
assert len(runs) == 2 and {r['state'] for r in runs} == {'completed', 'stopped'}
inputs = [(p.name, json.loads(p.read_text())) for p in (root / n).glob('input-*.json')]
inputs = [(name, x) for name, x in inputs if x['selector'] == '#script-source']
assert len(inputs) == 1 and inputs[0][1]['events']
source = inputs[0][1]['events'][0]['value']
assert all(e['isTrusted'] and e['value'] == source for e in inputs[0][1]['events'])
assert inputs[0][1]['textBytes'] == len(source.encode())
source_hash = hashlib.sha256(source.encode()).hexdigest()
clicks = [(p.name, json.loads(p.read_text())) for p in (root / n).glob('click-*.json')]
saves = [(name, x) for name, x in clicks if x['selector'] == '#script-save']
assert len(saves) == 1 and len(saves[0][1]['events']) == 1
assert saves[0][1]['events'][0]['isTrusted'] and saves[0][1]['events'][0]['matched']
assert inputs[0][1]['at'] < saves[0][1]['at']
revision = db['scriptRevisions'][0]
assert revision['sourceUtf8'] == source and revision['contentHash'] == source_hash
results = {r['resultId']: r for r in db['results']}
for run in runs:
    assert run['retirementState'] == 'released' and run['workerRetired']
    result = results[run['resultId']]
    assert result['tag'] == 'controller-result' and result['runId'] == run['runId']
    assert result['state'] == run['state']
    assert result['revision']['sourceHash'] == run['revision']['sourceHash'] == source_hash
    assert result['revision']['revision'] == run['revision']['revision'] == 1
assert any(r['outcome']['ok'] for r in results.values())
assert any(r['outcome'].get('error', {}).get('code') == 'E_CANCELLED' for r in results.values())

p = 'native-persistence-f462/'
before = observed(p + 'saved-before-restart.json')
restored = observed(p + 'restored-after-restart.json')
before_storage = state(before, 'service_worker')['tools']
restored_worker = state(restored, 'service_worker')
assert restored_worker['tools'][namespace] == before_storage[namespace]
assert restored_worker['tools'][catalog] == before_storage[catalog]
assert control(state(restored, 'iframe'), 'note-text')['value'] == note
assert len([c for c in restored_worker['contexts'] if c['contextType'] == 'SIDE_PANEL']) == 1
restart = read(p + 'launcher-tools-r1-restart-verified.json')
assert restart['sameProfile'] and not restart['restartObserved']['previousPidAlive']
assert restart['previousPid'] != restart['pid']
assert restart['restartObserved']['lifecycle'][-1]['previousExitCode'] == 0
uninstalled = observed(p + 'uninstalled-after-restart.json')
uninstalled_storage = state(uninstalled, 'service_worker')['tools']
assert namespace not in uninstalled_storage and not uninstalled_storage.get(catalog)
assert not any(r['target']['type'] == 'iframe' for r in uninstalled['observations'])
for folder in ['native-final-f462', 'native-persistence-f462']:
    cleanup = read(folder + '/cleanup.json')
    assert cleanup['cleanupStatus'] == 'PASS' and cleanup['profileRemoved'] and not cleanup['pidAliveAfterExit']

bundle = (root / 'f462-quick-notes.opendesk-tool.json').read_bytes()
built = Path(identities['snapshot']) / 'artifacts/sidebar-tools/quick-notes/1.0.0/quick-notes.opendesk-tool.json'
assert bundle == built.read_bytes()
tool_package = json.loads(bundle)
assert tool_package['html'] and tool_package['css'] and tool_package['js']
assert 'data:image/png;base64,' in tool_package['html']
equal_sources = []
for item in read('native-source-input-reuse.json')['equalDirectSources']:
    name = item['path']
    old = subprocess.check_output(['git', 'show', 'b18f4f3275cc5307a553548d938a531bdc93421c:' + name], cwd=repo)
    new = subprocess.check_output(['git', 'show', sha + ':' + name], cwd=repo)
    equal_sources.append({'path': name, 'equal': old == new, 'oldHash': hashlib.sha256(old).hexdigest(), 'newHash': hashlib.sha256(new).hexdigest()})
save('f462-bounded-source-reuse.json', {'sourceSha': sha, 'equalDirectSources': equal_sources,
     'rule': 'Earlier b18 width/200%/React/Vue/update receipts retain their original package identity. Equal files support bounded input reuse, not new whole-package PASS.'})
save('f462-native-derived-verdict.json', {
    'at': datetime.now(timezone.utc).isoformat(), 'sourceSha': sha, 'packageHash': package_hash,
    'status': 'NATIVE_PASS', 'scope': 'Enumerated actual browser cases only; overall R1 remains NATIVE_NOT_VERIFIED',
    'selectedNoInstallation': True, 'explicitInstallationNoExecution': True,
    'renderTitleUrlPngChineseSave': True, 'opaqueApiAndEnumeratedMessageAttacks': True,
    'destroyReopen20': True, 'cyclesBaseline': cycles['baseline'], 'cyclesAfterGc': cycles['afterGc'],
    'windowsNavigationBusinessTabOffline': True, 'computationCspDuringActualRun': True,
    'saveInputRaw': n + inputs[0][0], 'saveClickRaw': n + saves[0][0], 'savedRevision': revision,
    'runs': [{k: r[k] for k in ['runId', 'resultId', 'state', 'revision', 'retirementState']} for r in runs],
    'sameProfileRestartRestoresChinese': True, 'restartReceipt': p + 'launcher-tools-r1-restart-verified.json',
    'uninstallCatalogAndNamespaceRemoved': True,
    'uninstallLimitation': 'Native confirmation and storage removal are observed. The click-count probe exited1 after the modal; its unique-click assertion is not claimed PASS. Other tools and retained runs use earlier exact-package evidence.',
    'sourcePackageJsonBytes': len(bundle), 'sourcePackageJsonHash': hashlib.sha256(bundle).hexdigest(),
    'cleanup': 'Both owned profiles removed; own server stopped; resource receipt retained',
    'remaining': ['Actual320 host (Chrome155 minimum360)', 'Delayed onChanged and already-entered Chrome I/O races have component evidence only', 'Installed Task v1 navigation not independently retested on f462', 'JSX/TSX/Vue/Tailwind source importer NOT_SUPPORTED', 'Independent finalF3 and ZIP are not closed by this workstream']})
print('f462 native scoped assertions PASS; overall NATIVE_NOT_VERIFIED')
