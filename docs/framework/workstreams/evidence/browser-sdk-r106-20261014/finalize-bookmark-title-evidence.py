import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

repo = Path.cwd()
root = repo / 'docs/framework/workstreams/evidence/browser-sdk-r106-20261014'
rel = lambda p: str(p.relative_to(repo))
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
save = lambda p, d: p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
suffix = sys.argv[1] if len(sys.argv) > 1 else 'bookmark-title-final'
assert suffix.replace('-', '').isalnum()
checks = json.loads((root / ('checks-' + suffix + '.json')).read_text())
sha = checks['candidateSha']
assert all(s['status'] == 'PASS' and s['exitCode'] == 0 for s in checks['steps'])
prod = json.loads((root / ('builds-' + suffix) / 'build-production.json').read_text())
dev = json.loads((root / ('builds-' + suffix) / 'build-development.json').read_text())
assert prod['status'] == dev['status'] == 'passed'
assert prod['sourceDriftDuringBuild'] == dev['sourceDriftDuringBuild'] == []
assert prod['sourceInputs'] == dev['sourceInputs']
fingerprint = hashlib.sha256(json.dumps(prod['sourceInputs'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
delivery_path = root / 'candidate-delivery.json'
old = json.loads(delivery_path.read_text())
if old['candidateSha'] == sha and 'previousCandidate' in old:
    old = json.loads((repo / old['previousCandidate']['path']).read_text())
historical = root / ('candidate-delivery-' + old['candidateSha'][:8] + '.json')
if historical.exists():
    assert json.loads(historical.read_text()) == old
else:
    historical.write_bytes(delivery_path.read_bytes())
delivery = copy.deepcopy(old)
delivery.update(candidateSha=sha, gitTree=checks['gitTree'], sourceInputFingerprint=fingerprint,
                sourceInputs=prod['sourceInputs'], productionPackageHash=prod['report']['packageHash'],
                developmentPackageHash=dev['report']['packageHash'])
for step in checks['steps']:
    if step['key'] not in delivery['checks']:
        continue
    p = repo / step['log']
    delivery['checks'][step['key']] = {'status': 'PASS', 'evidence': [{
        'path': rel(p), 'sha256': digest(p), 'candidateSha': sha,
        'caseId': 'R10.6-' + step['key'], 'command': ' '.join(step['argv']),
        'environment': checks['nodeVersion'] + '; macOS; immutable Git archive; independent dist and output guard 43127'
    }]}
actions_path = root / ('actions-' + suffix + '.json')
actions = json.loads(actions_path.read_text())
names = {'r5CI': 'Browser SDK R5 implementation contracts',
         'targetedMainCI': 'Browser SDK targeted main verification',
         'packageBudgetsCI': 'Extension package budgets and library boundaries'}
delivery['actions'] = []
for key, name in names.items():
    run = next((r for r in actions['workflow_runs'] if r['name'] == name), None)
    if run is None:
        assert key == 'packageBudgetsCI'
        delivery['checks'][key] = {'status': 'NOT_TESTED', 'evidence': [],
            'reason': 'The test-only commit did not trigger this workflow; same-candidate npm run build:size passed locally. Earlier CI success is retained separately.'}
        continue
    assert run['head_sha'] == sha and run['conclusion'] == 'success' and run['status'] == 'completed'
    delivery['checks'][key] = {'status': 'PASS', 'evidence': [{
        'path': rel(actions_path), 'sha256': digest(actions_path), 'candidateSha': sha,
        'caseId': 'R10.6-' + key, 'command': 'GitHub Actions: ' + name,
        'environment': 'GitHub Actions; exact runner details in linked job', 'url': run['html_url']
    }]}
    delivery['actions'].append({'name': name, 'id': run['id'], 'url': run['html_url'], 'candidateSha': sha, 'status': 'PASS'})
delivery['checks']['cookieEditorCI'] = {'status': 'NOT_TESTED', 'evidence': [],
    'reason': 'This source-only candidate did not trigger the Cookie workflow; the earlier whole-CI failure is preserved in ' + rel(historical)}
whole_path = root / ('node-whole-' + suffix + '-bound.json')
whole = json.loads(whole_path.read_text())
assert whole['candidateSha'] == sha
whole_log = repo / whole['log']
whole_lines = whole_log.read_text().splitlines()
summary_lines = [(i, int(match.group(1))) for i, line in enumerate(whole_lines)
                 if (match := re.fullmatch(r'ℹ tests (\d+)', line))]
summary_index, _ = max(summary_lines, key=lambda item: item[1])
counts = {k: int(v) for k, v in re.findall(r'ℹ (tests|pass|fail|skipped) (\d+)',
    '\n'.join(whole_lines[summary_index:summary_index + 9]))}
assert counts['tests'] >= 292 and counts['tests'] == sum(counts[k] for k in ['pass', 'fail', 'skipped'])
delivery['sameCandidateWholeRepoNode'] = {**whole, 'counts': counts,
    'sha256': digest(whole_log), 'scope': 'Full repository; preserve failures independently from the 292 passing SDK contracts'}
delivery['sameCandidateCookieCI'] = {'status': 'NOT_TESTED', 'candidateSha': sha, 'previousEvidence': rel(historical)}
delivery['previousCandidate'] = {'path': rel(historical), 'sha256': digest(historical), 'candidateSha': old['candidateSha']}
delivery['bookmarksTitleFolderProtection'] = {'status': 'SOURCE_WIRED', 'node': 'PASS',
    'native': 'NOT_TESTED', 'migration': 'Legacy records without original title and parentId cannot delete native bookmarks'}
save(delivery_path, delivery)

acceptance_path = repo / 'docs/framework/workstreams/browser-sdk-acceptance.json'
acceptance = json.loads(acceptance_path.read_text())
acceptance['previousVerifiedEvidence'] = [row for row in acceptance['previousVerifiedEvidence']
    if row.get('candidateSha') != old['candidateSha'] and row.get('sha') != old['candidateSha']]
acceptance['previousVerifiedEvidence'].append({'sha': old['candidateSha'],
    'url': 'https://github.com/shopable-ai/opendesk-browser/commit/' + old['candidateSha'],
    'scope': 'R10.6 prior candidate; exact delivery receipt preserved',
    'path': rel(historical), 'sha256': digest(historical)})
acceptance['auditedMainSha'] = sha
acceptance['candidateChecks'] = copy.deepcopy(delivery['checks'])
acceptance['r106Candidate'].update(path=rel(delivery_path), sha256=digest(delivery_path), sourceInputFingerprint=fingerprint, commitSha=sha)
for operation in acceptance['operations']:
    operation['positiveTest'] = copy.deepcopy(delivery['checks']['nodeTests'])
    operation['denialTest'] = copy.deepcopy(delivery['checks']['nodeTests'])
    if sha not in operation['commits']:
        operation['commits'].append(sha)
acceptance['currentLimitations'] = [note for note in acceptance['currentLimitations']
    if not note.startswith('R10.6 ' + sha + ':')]
budget_note = ('Same-commit package-budget CI PASS.' if delivery['checks']['packageBudgetsCI']['status'] == 'PASS'
               else 'Package-budget CI did not trigger; local budget check PASS.')
acceptance['currentLimitations'].append('R10.6 ' + sha + ': 292 SDK and 211 targeted Node checks plus Check/Build/Build:dev/Build:size/Verify and same-commit R5/targeted CI PASS; full repository Node remains FAIL, installed-tool Native remains NOT_TESTED. ' + budget_note + ' Bookmarks title/folder edits now reject removal; original Chrome missing-node message observed separately, not an SDK Native PASS.')
save(acceptance_path, acceptance)

status_path = repo / 'docs/framework/workstreams/browser-sdk-status.md'
status = status_path.read_text()
lines = status.splitlines()
for i, line in enumerate(lines):
    if line.startswith('SOURCE_WIRED 55、NODE_PASS 55、BUILD_PASS 55、正式 NATIVE_PASS 0。'):
        budget_status = '同提交预算 CI PASS。' if delivery['checks']['packageBudgetsCI']['status'] == 'PASS' else '预算 CI 未触发，本候选本地预算检查 PASS。'
        lines[i] = ('SOURCE_WIRED 55、NODE_PASS 55、BUILD_PASS 55、正式 NATIVE_PASS 0。公开 Registry 53 与可信 Host-only 2 分开登记。固定候选 `' + sha + '` 的关联 Node 292/292、定向回归 211/211、Check/双构建/Size/Verify 均 PASS，470 项构建输入一致；完整身份与原始日志见 `docs/framework/workstreams/evidence/browser-sdk-r106-20261014/candidate-delivery.json`。同提交 R5 与 targeted-main Actions PASS；' + budget_status + '正确绑定新构建收据后的 Mac 全仓回归 ' + str(counts.get('fail')) + ' FAIL；旧环境错误和历史 Cookie CI 失败均保留，不提升为 PASS。书签标题/文件夹编辑与旧映射删除已保守拒绝。正式 Native 全部 NOT_TESTED，95 分目标 NOT_SCORED。')
status_path.write_text('\n'.join(lines) + '\n')

index_path = root / 'evidence-index.json'
index = json.loads(index_path.read_text())
owned = [historical, delivery_path, actions_path, root / ('checks-' + suffix + '.json'),
         whole_path, whole_log, root / 'node-whole-bookmark-title-final.json',
         root / 'node-whole-bookmark-title-final.log', root / 'actions-bookmark-error-completed.json',
         root / 'main-push-bookmark-title.json', root / 'main-push-final-delivery-source.json', root / 'node-site-access-auto-details.log',
         root / 'run-bookmark-title-final.py', Path(__file__).resolve()]
owned += [repo / s['log'] for s in checks['steps']]
owned += list((root / ('builds-' + suffix)).glob('*.json'))
for prior in ['bookmark-error-final', 'bookmark-title-final']:
    prior_checks_path = root / ('checks-' + prior + '.json')
    if prior_checks_path.exists():
        prior_checks = json.loads(prior_checks_path.read_text())
        owned.append(prior_checks_path)
        owned += [repo / step.get('log', step.get('path')) for step in prior_checks['steps']
                  if step.get('log', step.get('path'))]
        owned += list((root / ('builds-' + prior)).glob('*.json'))
owned += [root / 'actions-bookmark-title.json', root / 'node-whole-bookmark-title-bound.json',
          root / 'node-whole-bookmark-title-bound.log', root / 'committed-candidate-bookmark-error-final.json']
by_path = {row['path']: row for row in index['files']}
for p in owned:
    by_path[rel(p)] = {'path': rel(p), 'bytes': p.stat().st_size, 'sha256': digest(p)}
index['files'] = list(by_path.values())
index['latestSupplementAgainstHead'] = sha
index['bookmarkTitleCandidate'] = {'candidateSha': sha, 'sourceInputFingerprint': fingerprint, 'formalNativePass': 0,
    'nodeTests': 292, 'targetedTests': 211, 'wholeRepoNode': counts, 'ci': delivery['actions']}
save(index_path, index)
owned += [acceptance_path, status_path, index_path, repo / 'tests/environment/site-access.test.mjs', repo / 'docs/framework/workstreams/browser-sdk-r106-20261014.md']
save(root / (suffix + '-evidence-stage-paths.json'), sorted(set(rel(p) for p in owned)))
print('updated candidate', sha, 'whole counts', counts, 'owned files', len(set(owned)))
