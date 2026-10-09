"""Capture only this workstream's read-only preparation evidence; never install/run."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
BROWSER = OUT.parents[4]
SHARED = Path('/Users/shopme/Documents/workspace/opendesk-browser')
DESKTOP = Path('/Users/shopme/Documents/workspace/opendesk')
RAW = Path('/Users/shopme/Documents/workspace/opendesk-browser-r65-01a11fbc/evidence')
BASE = '996df38fd63f49630f2c8cad4c552b5f82462124'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

if '--check' in sys.argv:
    record = json.loads((OUT / 'read-only-baseline.json').read_text())
    for row in record['copiedRawResponses']:
        assert sha((OUT / row['copy']).read_bytes()) == row['sha256'], row['copy']
    assert record['implementationGate']['status'] == 'NOT_MET'
    assert record['takeoverStatuses']['DEFAULT_PROVIDER'] == 'NODE_UNCHANGED'
    print('PASS: copied original response hashes and recorded gate/status integrity; no product/native tests')
    sys.exit(0)

if (OUT / 'read-only-baseline.json').exists():
    raise SystemExit('Refusing to overwrite an existing capture; create a new evidence identity')

names = [
    'current-connected-status-response.json',
    'current-modern-http-target-response.json',
    'current-modern-http-response.json',
    'current-modern-http-owner-durable-response.json',
    'current-modern-http-durable-response.json',
    'current-stop-start-response.json',
    'current-stop-command-response.json',
    'current-stop-terminal-response.json',
]
index = json.loads((RAW / 'handoff-evidence-index.json').read_text())
copied = []
for name in names:
    relative = 'native-current/' + name
    original = RAW / relative
    data = original.read_bytes()
    response = json.loads(data)
    expected = index['files'][relative]['sha256']
    assert sha(data) == expected, relative
    destination = OUT / 'raw' / name
    destination.parent.mkdir(exist_ok=True)
    with destination.open('xb') as output:
        output.write(data)
    copied.append({'original': str(original), 'copy': 'raw/' + name,
                   'sha256': expected, 'bytes': len(data),
                   'requestId': response.get('requestId'),
                   'errorCode': response.get('error', {}).get('code')})

build = json.loads((RAW / 'current-builds/build-production.json').read_text())
build_comparison = []
for row in build['sourceInputs']:
    p = BROWSER / row['path']
    current = sha(p.read_bytes()) if p.is_file() else None
    build_comparison.append({**row, 'currentSha256': current,
                             'sameBytes': current == row['sha256']})

paths = git(BROWSER, 'ls-files', 'native-agent', 'src/native-agent').decode().splitlines()
paths += ['src/run-host.js', 'src/platform/host/controller-methods.js',
          'src/scripting/sandbox/controller.js', 'src/platform/storage/repository.js']
inputs = []
for name in paths:
    old = subprocess.run(['git', '-C', str(BROWSER), 'show', BASE + ':' + name],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    current = (BROWSER / name).read_bytes()
    shared = (SHARED / name).read_bytes()
    inputs.append({'path': name, 'baselineSha256': sha(old.stdout) if old.returncode == 0 else None,
                   'currentSha256': sha(current), 'sharedWorkspaceSha256': sha(shared),
                   'sameAsBaseline': old.returncode == 0 and old.stdout == current,
                   'sharedWorkspaceDiffers': current != shared})

archive = Path('/private/tmp/od65c-01a11fbc/.opendesk-browser/native-agent-r1')
archived_host = []
for name in ['native-host.mjs', 'wire.mjs', 'locations.mjs']:
    p = archive / name
    row = {'path': str(p), 'exists': p.exists(), 'symlink': p.is_symlink()}
    if p.is_file() and not p.is_symlink():
        data = p.read_bytes()
        match = next(x for x in inputs if x['path'] == 'native-agent/' + name)
        row.update({'sha256': sha(data), 'matchesBaselineCommit': sha(data) == match['baselineSha256'],
                    'matchesCurrentCommit': sha(data) == match['currentSha256']})
    archived_host.append(row)

refs = [RAW / 'r65-resource-confirmation-20261009-01a11fbc.json',
        RAW / 'r65-handoff-20261009-01a11fbc.md', RAW / 'handoff-evidence-index.json',
        RAW / 'current-builds/build-production.json',
        Path('/Users/shopme/.codex/worktrees/r62-native-01a11ff2/opendesk-browser/docs/framework/workstreams/r62-native-20261009-01a11ff2.json'),
        Path('/Users/shopme/.codex/worktrees/native-closure-1009/opendesk-browser/docs/framework/workstreams/native-closure-20261009-01a12028.json')]
resources = json.loads(refs[0].read_text())
record = {
    'schemaVersion': 1, 'workstreamId': 'opendesk-native-takeover-01a120ca',
    'observedUtc': datetime.now(timezone.utc).isoformat(),
    'activity': 'READ_ONLY_CONTRACT_AND_IMPLEMENTATION_PREPARATION',
    'browserCandidateSha': git(BROWSER, 'rev-parse', 'HEAD').decode().strip(),
    'sharedBrowserObservedSha': git(SHARED, 'rev-parse', 'HEAD').decode().strip(),
    'openDeskObservedSha': git(DESKTOP, 'rev-parse', 'HEAD').decode().strip(),
    'sharedBrowserStatus': git(SHARED, 'status', '--short').decode().splitlines(),
    'openDeskStatus': git(DESKTOP, 'status', '--short').decode().splitlines(),
    'baseline': {'sourceSha': BASE, 'productionPackageHash': build['report']['packageHash'],
                 'productionZipSha256': sha((RAW / 'current-production.zip').read_bytes()),
                 'buildInputsExcludeNodeHost': not any(x['path'].startswith('native-agent/') for x in build['sourceInputs'])},
    'copiedRawResponses': copied, 'buildInputComparison': build_comparison,
    'communicationInputComparison': inputs, 'archivedNodeHostComparison': archived_host,
    'originalReferences': [{'path': str(p), 'sha256': sha(p.read_bytes())} for p in refs],
    'resourceOwnerObservation': {k: resources[k] for k in [
        'observedAt', 'ownerThreadId', 'ownedLiveProcesses', 'currentSessionProfileExists',
        'newNativeRegistrationOrSessionCreatedSinceHandoff', 'activeDistOrZipBuildOrLockHeld',
        'guardCleanupStatus', 'lastActuallyLoadedCandidateSha']},
    'currentContractDelta': {
        'requiredCoreMethods': ['bridge.status','target.current','script.save','run.start','run.get','run.stop'],
        'additionalExistingWireMethods': ['page.preview','page.get','request.get'],
        'additionalExistingCliMethod': 'request.get',
        'authenticatedLocalDevVersion': 'negotiated from Browser welcome.localDevVersion===1',
        'providerSession': 'provider.register/registered/rejected/changed; dev.request/response; providerEpoch',
        'limitsUnchanged': {'wireVersion': 1, 'maxBytes': 61440, 'maxInflight': 12, 'maxClients': 8},
        'currentInstalledSnapshotFiles': ['native-host.mjs','wire.mjs','locations.mjs']},
    'implementationGate': {'status': 'NOT_MET', 'reasons': [
        'Current candidate saved/CAS and active pin/document/revocation/ACK-loss/disconnect safety matrix remains incomplete in owner records',
        'Current main Node/Browser inputs changed after the last loaded candidate; no promotion of prior Native receipts',
        'Current Stop/get original files lack full generated request envelopes per independent Native owner',
        'Resource release does not prove absence or disposition of all unresolved effects']},
    'resourceClaims': [], 'productFilesModified': [],
    'commandsNotRun': ['product tests','build','CFT','Native requests','install/update/cleanup','Host registration','migration','release/publish'],
    'takeoverStatuses': {'SOURCE_IMPLEMENTED':'NO','CONTRACT_COMPATIBLE':'NOT_VERIFIED',
        'NATIVE_CHROME_VERIFIED':'NOT_TESTED','MIGRATION_VERIFIED':'NOT_TESTED','DEFAULT_PROVIDER':'NODE_UNCHANGED'},
}
(OUT / 'read-only-baseline.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print('Captured 8 hash-verified raw responses and current input identities; gate NOT_MET')
