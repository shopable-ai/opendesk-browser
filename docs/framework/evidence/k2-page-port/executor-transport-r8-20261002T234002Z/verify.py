from pathlib import Path
import difflib, hashlib, json, re, shlex, shutil, subprocess, sys
from datetime import datetime, timezone

base = Path(__file__).resolve().parent
root = base.parents[4]
node = shutil.which('node')
owned = {'page-agent.js': 'src/agents/page-agent.js', 'page-port-index.js': 'src/platform/page-port/index.js',
         'page-port-service.test.mjs': 'tests/foundation/page-port-service.test.mjs'}
dependencies = ['src/platform/journal.js', 'src/platform/protocol.js', 'src/platform/target/index.js',
                'src/platform/storage/idb.js']
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def hashes():
    return {path: sha(root / path) for path in [*owned.values(), *dependencies]}

old = (base / 'source-before/page-port-service.test.mjs').read_text()
expected = old.replace("import {digest, PROTOCOL} from '../../src/platform/protocol.js';",
    "import {digest, PROTOCOL} from '../../src/platform/protocol.js';\nimport {commandRecordKey, pageCommandKey} from '../../src/platform/journal.js';")
expected = expected.replace("async function setup() { const f = await fixture(); f.targetService",
    "async function setup() { const f = await fixture();\n  await f.storage.transaction(['commandJournal'], 'readwrite', async tx => {\n    await tx.delete('commandJournal', f.command.commandId);\n    await tx.put('commandJournal', f.command, commandRecordKey(f.command));\n  });\n  f.targetService")
expected = expected.replace("f.storage.value('commandJournal', f.command.commandId)", "f.storage.value('commandJournal', commandRecordKey(f.command))")
expected = expected.replace("f.storage.value('commandJournal', 'command-1')", "f.storage.value('commandJournal', commandRecordKey(f.command))")
expected = expected.replace("f.storage.value('commandJournal', 'page-raw:command-1')", "f.storage.value('commandJournal', pageCommandKey('raw', f.identity.runId, f.command.commandId))")
expected = expected.replace("type: 'PAGE_FRAME_ACK', payload: {commandId: 'command-1', frameIndex: 0, digest: frame.digest}",
    "type: 'PAGE_FRAME_ACK', payload: {identity: f.identity, commandId: 'command-1', frameIndex: 0, digest: frame.digest}")
after = (root / owned['page-port-service.test.mjs']).read_text()
start = after.index("\ntest('page transport sends its first frame")
stop = after.index("\nasync function sourceSetup()")
assert after[:start] + after[stop:] == expected, 'Existing oracle changed beyond fixture key/ACK identity adaptation'
diff = ''.join(''.join(difflib.unified_diff((base / 'source-before' / before).read_text().splitlines(keepends=True),
    (root / path).read_text().splitlines(keepends=True), fromfile=path + ' (before)', tofile=path + ' (after)'))
    for before, path in owned.items())
(base / 'changes.diff').write_text(diff)

runs = [('syntax-agent', [node, '--check', owned['page-agent.js']]),
        ('syntax-port', [node, '--check', owned['page-port-index.js']]),
        ('syntax-tests', [node, '--check', owned['page-port-service.test.mjs']]),
        ('original-ack', [node, '--test', '--test-name-pattern=packaged DOM agent returns short ACK',
                          owned['page-port-service.test.mjs']]),
        ('page-port', [node, '--test', *[str(path.relative_to(root)) for path in sorted((root / 'tests/foundation').glob('page-port*.test.mjs'))]]),
        ('foundation', [node, '--test', *[str(path.relative_to(root)) for path in sorted((root / 'tests/foundation').glob('*.test.mjs'))]])]
before_hashes = hashes()
results = []
for name, command in runs:
    with (base / (name + '.log')).open('w') as output:
        process = subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT)
    log = (base / (name + '.log')).read_text()
    counts = {label: int(value) for label, value in re.findall(r'ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)', log)}
    results.append({'name': name, 'command': shlex.join(command), 'exitCode': process.returncode,
                    'summary': counts, 'log': name + '.log', 'logSha256': sha(base / (name + '.log'))})
    print(json.dumps(results[-1], ensure_ascii=False), flush=True)
after_hashes = hashes()
owned_stable = all(before_hashes[path] == after_hashes[path] for path in owned.values())
shared_stable = all(before_hashes[path] == after_hashes[path] for path in dependencies)
report = {'role': 'executor', 'finalIndependentAcceptance': False,
    'timestampUtc': datetime.now(timezone.utc).isoformat(), 'cwd': str(root),
    'nodeVersion': subprocess.check_output([node, '--version'], text=True).strip(),
    'sourceBeforeSha256': {path: sha(base / 'source-before' / before) for before, path in owned.items()},
    'testInputsBeforeSha256': before_hashes, 'testInputsAfterSha256': after_hashes,
    'ownedInputsStableDuringVerification': owned_stable, 'sharedInputsStableDuringVerification': shared_stable,
    'oraclePreservation': {'existingTestContentUnchangedAfterOnlyFixtureKeyAndACKIdentityAdaptation': True,
                          'addedRegressionTests': 6},
    'results': results, 'changesDiffSha256': sha(base / 'changes.diff'),
    'baseline': {'command': 'node --test --test-name-pattern="packaged DOM agent returns short ACK" tests/foundation/page-port-service.test.mjs',
                 'exitCode': 1, 'tests': 1, 'pass': 0, 'fail': 1, 'log': 'baseline.log', 'logSha256': sha(base / 'baseline.log')},
    'scope': {'ownedFiles': list(owned.values()), 'evidenceDirectory': str(base)}}
(base / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
sys.exit(0 if owned_stable and shared_stable and all(result['exitCode'] == 0 for result in results) else 1)
