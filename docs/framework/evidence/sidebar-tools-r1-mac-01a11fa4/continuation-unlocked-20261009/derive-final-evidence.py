"""Offline derivation from retained real-browser receipts; no browser actions."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[4]
at = datetime.now(timezone.utc).isoformat()
sha = '9ad3e494aa1eb1ec6e1eefefbe3ffa336621f158'
b18 = 'b18f4f3275cc5307a553548d938a531bdc93421c'
catalog = 'opendesk.sidebar-tools.installed.v1'
namespace = 'opendesk.sidebar-tools.data.v1:quick-notes'
note = '中文最终验收：关闭重开与浏览器重启后保留。'

def read(name):
    return json.loads((root / name).read_text())

def save(name, value):
    assert not (root / name).exists(), 'Never overwrite a retained derived receipt'
    (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def worker(value):
    rows = [o['state']['tools'] for o in value['observations']
            if o['target']['type'] == 'service_worker' and 'state' in o]
    assert len(rows) == 1
    return rows[0]

def tool(value):
    rows = [o['state'] for o in value['observations']
            if o['target']['type'] == 'iframe' and 'state' in o
            and '/sidebar-tools/sandbox.html' in o['target']['url']]
    assert len(rows) == 1
    return rows[0]

def control(state, name):
    rows = [c for c in state['controls'] if c.get('id') == name]
    assert len(rows) == 1
    return rows[0]

native = 'native-integrated-9ad/'
identities = read('integrated-9ad-package-identities.json')
assert identities['sourceSha'] == sha
for name in ['selected', 'installed-unopened', 'saved', 'uninstalled']:
    x = read(native + name + '.json')
    assert x['session']['package']['packageHash'] == identities['production']['packageHash']
    if name in ['selected', 'installed-unopened', 'uninstalled']:
        assert not any(o['target']['type'] == 'iframe' for o in x['observations'])
selected = worker(read(native + 'selected.json'))
assert not selected.get(catalog)
installed = worker(read(native + 'installed-unopened.json'))
assert [p['id'] for p in installed[catalog]] == ['quick-notes']
saved = tool(read(native + 'saved.json'))
assert control(saved, 'note-text')['value'] == '中文最新主线验收：工具独立存储与真实按钮保存。'
assert 'OpenDesk Browser · Browser Test Lab' in control(saved, 'page-summary')['text']
assert 'http://127.0.0.1:43111/demo-form.html' in control(saved, 'page-summary')['text']
assert saved['images'][0]['complete'] and saved['images'][0]['naturalWidth'] == 1
assert set(saved['chromeApis'].values()) == {'undefined'}
security = read(native + 'security.json')
cycles = read(native + 'cycles-20.json')
assert security['status'] == cycles['status'] == 'NATIVE_PASS'
assert len(cycles['measurements']) == 21 and cycles['closed']['toolFrames'] == 0
assert len({m['messageListeners'] for m in cycles['measurements']}) == 1
assert tool(read(native + 'cycles-restored.json'))['controls']
assert control(tool(read(native + 'before-uninstall.json')), 'note-text')['value'] == note
uninstalled = worker(read(native + 'uninstalled.json'))
assert not uninstalled.get(catalog) and namespace not in uninstalled
cleanup = read(native + 'cleanup.json')
assert cleanup['cleanupStatus'] == 'PASS' and cleanup['profileRemoved']
assert not cleanup['pidAliveAfterExit'] and not cleanup['residual']

before_runs = read(native + 'draft-completed-runs.json')
after_runs = read(native + 'task-records-after-uninstall.json')
db = after_runs['database']
runs = [r for r in db['runs'] if r.get('runId')]
assert len(runs) == 2 and {r['state'] for r in runs} == {'completed', 'stopped'}
source = json.loads((repo / 'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/tool-fixtures/readonly-task.json').read_text())['sourceUtf8']
source_hash = hashlib.sha256(source.encode()).hexdigest()
inputs = [(f.name, json.loads(f.read_text())) for f in (root / native).glob('input-*.json')]
inputs = [(n, x) for n, x in inputs if x['selector'] == '#script-source']
assert len(inputs) == 1 and inputs[0][1]['textBytes'] == len(source.encode())
assert inputs[0][1]['events'] and all(e['isTrusted'] and e['value'] == source for e in inputs[0][1]['events'])
clicks = [(f.name, json.loads(f.read_text())) for f in (root / native).glob('click-*.json')]
saves = [(n, x) for n, x in clicks if x['selector'] == '#script-save']
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
for old in before_runs['database']['results']:
    assert results[old['resultId']] == old
assert any(r['outcome']['ok'] for r in results.values())
assert any(r['outcome'].get('error', {}).get('code') == 'E_CANCELLED' for r in results.values())
save(native + 'task-and-save-derived-verdict.json', {
    'at': at, 'status': 'NATIVE_PASS', 'sourceSha': sha,
    'packageHash': identities['production']['packageHash'],
    'method': 'Strict offline derivation from real full-input, unique Save click, revisions and controller records; no native ack synthesized.',
    'sourceUtf8Bytes': len(source.encode()), 'sourceHash': source_hash,
    'inputRaw': inputs[0][0], 'saveRaw': saves[0][0], 'savedRevision': revision,
    'runs': [{k: r[k] for k in ['runId', 'resultId', 'state', 'revision', 'retirementState']} for r in runs],
    'recordsPreservedAfterToolUninstall': True,
    'taskV1Install': 'NATIVE_NOT_VERIFIED on 9ad: imported package remains candidate pending verification; gate was not bypassed.'})

# Preserve the actual observation after an accidental acceptance-file name collision.
vue = read('native-final-b18-width400/vue-framework.json')
vue_tool = tool(vue)
assert control(vue_tool, 'vue-count')['text'] == '计数 1'
assert set(vue_tool['chromeApis'].values()) == {'undefined'}
vue_clicks = [(f.name, json.loads(f.read_text())) for f in (root / 'native-final-b18-width400').glob('click-*.json')]
vue_clicks = [(n, x) for n, x in vue_clicks if x['selector'] == '#vue-count']
assert len(vue_clicks) == 1 and len(vue_clicks[0][1]['events']) == 1
assert vue_clicks[0][1]['events'][0]['isTrusted'] and vue_clicks[0][1]['events'][0]['matched']
save('vue-framework-derived-verdict.json', {
    'at': at, 'status': 'NATIVE_PASS', 'sourceSha': b18,
    'packageHash': vue['session']['package']['packageHash'],
    'observationRaw': 'native-final-b18-width400/vue-framework.json',
    'clickRaw': 'native-final-b18-width400/' + vue_clicks[0][0],
    'result': {'text': '计数 1', 'chromeApis': vue_tool['chromeApis']},
    'limitation': 'The original framework PASS receipt was overwritten by same-name read-only observation before commit. This is a new bounded derivation, not a recovered original receipt.',
    'officialSourceImport': 'NOT_SUPPORTED'})

restart = read('native-final-b18/restarted-restored.json')
assert restart['session']['sameProfile'] and restart['session']['restartObserved']['previousPidAlive'] is False
assert worker(restart)[namespace]['note'] == control(tool(restart), 'note-text')['value'] == note
updated = worker(read('native-final-b18-width400/updated-before-uninstall.json'))
removed = worker(read('native-final-b18-width400/uninstalled.json'))
assert next(t for t in updated[catalog] if t['id'] == 'quick-notes')['version'] == '1.0.1'
assert updated[namespace]['note'] == '400像素：中文内容和按钮正常。'
assert namespace not in removed
assert removed[catalog] == [t for t in updated[catalog] if t['id'] != 'quick-notes']
for width, name in [(400, 'native-final-b18-width400'), (600, 'native-final-b18-widths')]:
    x = read(name + '/layout-' + str(width) + '.json')
    assert x['status'] == 'NATIVE_PASS' and x['state']['host']['width'] == width
    assert x['state']['host']['scrollWidth'] == width
    assert x['state']['tool']['width'] == x['state']['tool']['scrollWidth']
zoom = read('native-final-b18/actual-200-fixed.json')
host_zoom = next(s['state'] for s in zoom['states'] if '/ui/tool.html' in s['target']['url'])
tool_zoom = next(s['state'] for s in zoom['states'] if '/sidebar-tools/sandbox.html' in s['target']['url'])
assert host_zoom['devicePixelRatio'] == tool_zoom['devicePixelRatio'] == 4
assert host_zoom['width'] == host_zoom['scrollWidth'] == 180
assert tool_zoom['width'] == tool_zoom['scrollWidth'] == 142

sources = ['src/ui/sidebar-tools.js', 'src/ui/tool-shell.css', 'src/ui/tool.html',
           'src/ui/tool-shell.js', 'src/ui/task-workbench.js',
           'src/sidebar-tools/bridge.js', 'src/sidebar-tools/sandbox.html',
           'src/ui/sidebar-tools/package.js', 'scripts/build-sidebar-tool.mjs']
source_comparison = []
for filename in sources:
    old = subprocess.check_output(['git', 'show', b18 + ':' + filename], cwd=repo)
    new = subprocess.check_output(['git', 'show', sha + ':' + filename], cwd=repo)
    assert old == new, filename
    source_comparison.append({'path': filename, 'sha256': hashlib.sha256(new).hexdigest(), 'equal': True})
save('native-source-input-reuse.json', {
    'at': at, 'beforeSourceSha': b18, 'afterSourceSha': sha,
    'equalDirectSources': source_comparison,
    'changedBundleFiles': [f['path'] for f in identities['changedPackageFiles']],
    'rule': 'Reuse bounded prior evidence only for matching direct inputs. Different package hashes remain distinct. New 9ad native cases are recorded separately; neither set is whole-package acceptance.'})
save('continuation-closeout.json', {
    'at': at, 'sourceSha': sha, 'overallStatus': 'NATIVE_NOT_VERIFIED',
    'productionPackageHash': identities['production']['packageHash'],
    'engineering': read('integrated-9ad-engineering-results.json'),
    'remoteCi': {'status': 'CI_PASS', 'sha': read('github-ci-latest-remote-main.json')['remoteMainSha'],
                 'successfulWorkflows': len(read('github-ci-latest-remote-main.json')['runs']),
                 'scope': 'Remote 17fea workflows and Mac handshake diagnostic, not local 9ad Side Panel final E2E.'},
    'currentNative': {'sourceSha': sha, 'packageHash': identities['production']['packageHash'],
        'status': 'NATIVE_PASS for listed cases only',
        'cases': ['selection and explicit installation do not auto-open', 'HTML/CSS/local PNG/title/URL',
                  'trusted Chinese save', '20 destroy/reopen cycles', 'opaque API and enumerated message rejection',
                  'full draft Save, completed and stopped runs, own result revisions, released resources',
                  'window binding, page navigation and business-tab offline save',
                  'uninstall removes namespace and preserves prior draft records', 'owned browser/profile cleanup'],
        'domCounters': {'baseline': cycles['baseline'], 'afterGc': cycles['afterGc']},
        'scope': 'No claim of zero heap leakage or full Task v1 installation/Native host acceptance.'},
    'boundedEarlierNative': {'sourceSha': b18, 'packageHash': vue['session']['package']['packageHash'],
        'cases': ['400/600 CSS px', 'actual Chrome default 200% (host180/tool142/DPR4)',
                  'same-profile restart restores Chinese note', 'React+Tailwind/Vue precompiled classic JS and static CSS',
                  'update v1.0.1 preserves note; uninstall preserves React/Vue installed packages'],
        'reuseScope': 'Matching direct R1 inputs only; prior package evidence not upgraded to 9ad whole-package PASS.'},
    'gaps': ['existing Native installation guard prevents latest local full test (427/428)',
             'physical 320 CSS px Side Panel not verified: Chrome155 minimum360',
             'late onChanged revocation and already-entered Chrome I/O uninstall race have component-only evidence',
             'fresh 9ad same-profile restart and Task v1 installed-task jump not independently native revalidated',
             'official JSX/TSX/Vue/Tailwind source compilation NOT_SUPPORTED',
             'independent final F3 and matching ZIP acceptance not closed by this R1 workstream'],
    'scores': {'function': 94, 'security': 94, 'visual': 94, 'lifecycle': 94, 'developmentExperience': 92},
    'scoreMethod': 'Conservative engineering judgment against required cases; not completion percentage or test-count arithmetic.'})
print(json.dumps({'status': 'DERIVATION_VALID', 'sourceSha': sha, 'boundedNativeCases': True,
                  'overallStatus': 'NATIVE_NOT_VERIFIED'}, ensure_ascii=False))
