import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import time

repo = Path.cwd()
root = repo / 'docs/framework/workstreams/evidence/browser-sdk-r106-20261014'
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
suffix = sys.argv[1] if len(sys.argv) > 1 else 'bookmark-title-final'
assert suffix.replace('-', '').isalnum()
archive = root / ('committed-candidate-' + suffix)
archive.mkdir(exist_ok=False)
process = subprocess.Popen(['git', 'archive', '--format=tar', sha], stdout=subprocess.PIPE)
with tarfile.open(fileobj=process.stdout, mode='r|') as stream:
    stream.extractall(archive, filter='data')
assert process.wait() == 0
subprocess.run(['/bin/cp', '-cR', str(repo / 'node_modules'), str(archive / 'node_modules')], check=True)
env = os.environ.copy()
env['OPENDESK_OUTPUT_GUARD_PORT'] = '43127'
env['OPENDESK_BUILD_EVIDENCE_DIR'] = str(root / ('builds-' + suffix))
template = json.loads((root / 'checks-bookmark-error-final.json').read_text())
receipt = {
    'candidateSha': sha,
    'gitTree': subprocess.check_output(['git', 'rev-parse', sha + '^{tree}'], text=True).strip(),
    'method': 'immutable Git archive, no checkout or worktree',
    'cwd': str(archive),
    'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
    'dailyDistUntouched': True,
    'privateGuardPort': 43127,
    'steps': []
}
output = root / ('checks-' + suffix + '.json')
for step in template['steps']:
    key, argv = step['key'], step['argv']
    log = root / (key + '-' + suffix + '.log')
    began = time.time()
    with log.open('w') as handle:
        result = subprocess.run(argv, cwd=archive, env=env, stdout=handle, stderr=subprocess.STDOUT)
    receipt['steps'].append({
        'key': key, 'argv': argv, 'status': 'PASS' if result.returncode == 0 else 'FAIL',
        'exitCode': result.returncode, 'durationSeconds': round(time.time() - began, 3),
        'log': str(log.relative_to(repo))
    })
    output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(key, receipt['steps'][-1]['status'], receipt['steps'][-1]['durationSeconds'], flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
print('candidate', sha, flush=True)
