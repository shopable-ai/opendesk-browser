"""Freeze only K1 source and explicit native outputs; never modify public gates."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess

ROOT = Path('/Users/shopme/Documents/workspace/opendesk-browser')
DOC = ROOT / 'docs/framework/prototypes/user-control-v2/m5-20261002-k1-permission-race-fix'
LANE = ROOT / 'tests/prototypes/user-control-v2'
PLAN = 'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1'
SOURCE = '4666d1e0275ee69e82ab9e0c713260df201a717a359fd6efca4dbc55af91cfd5'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def relative(path):
    return str(path.relative_to(ROOT))

def save(name, value):
    (DOC / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def file_row(path):
    return {'path': relative(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}

reports = []
report_paths = []
for label in ['138', '154']:
    path = Path(json.loads((LANE / ('m5-round6-owner-guard-final-' + label + '.log')).read_text())['report'])
    report_paths.append(path)
    reports.append(json.loads(path.read_text()))

manifest_bytes = (report_paths[0].parent / 'candidate-manifest.json').read_bytes()
assert hashlib.sha256(manifest_bytes).hexdigest() == SOURCE
assert manifest_bytes == (report_paths[1].parent / 'candidate-manifest.json').read_bytes()
source = json.loads(manifest_bytes)
assert source['planManifestSha256'] == PLAN
for item in source['files']:
    assert digest(LANE / item['path']) == item['sha256'], item['path']
(DOC / 'final-source-manifest.json').write_bytes(manifest_bytes)

for role in ['architect', 'critic']:
    review = json.loads((ROOT / 'docs/framework/reviews/migration-execution-v5/round-6' / (role + '.json')).read_text())
    assert review['candidateManifestSha256'] == PLAN and review['verdict'] == 'APPROVE' and not review['blockers']

probe_dir = Path((LANE / 'm5-round6-final-native-probe-path.txt').read_text().strip())
probe = json.loads((probe_dir / 'report.json').read_text())
assert probe['candidateSha256'] == SOURCE and probe['serverClosed']
assert probe['fixtureHostSha256'] == digest(LANE / 'fixture/host.js')
probe_checks = []
for native in probe['runs']:
    assert 'error' not in native
    observed = native['probe']
    events = observed['observations']
    kinds = [event['kind'] for event in events]
    assert kinds == ['native-permission-request', 'host-stop-returned', 'native-permission-resolved']
    assert events[0]['monoMs'] <= events[1]['monoMs'] <= events[2]['monoMs']
    assert events[0]['active'] and events[1]['active'] is None and events[2]['active'] is None and events[2]['value'] is True
    assert observed['terminal']['kind'] == 'stopped' and not native['nativeServerHits']
    assert '/after-stop?' not in observed['actualTab']['url']
    assert observed['subsequent']['kind'] == 'result' and observed['subsequent']['value'] == 'Independent native stop fence'
    assert all(value == 0 for value in native['cleanup'].values())
    assert native['browserClosed'] and native['profileRemoved'] and not Path(native['profile']).exists()
    probe_checks.append({'version': native['version'], 'status': 'PASS', 'nativePermissionStopOrder': kinds,
                         'monoMs': [event['monoMs'] for event in events], 'nativeTabsUpdateDispatches': 0,
                         'rawServerHits': native['nativeServerHits'], 'targetURL': observed['actualTab']['url'],
                         'newRunValue': observed['subsequent']['value'], 'cleanup': native['cleanup']})

matrix = []
case_ids = None
for label, path, report in zip(['138', '154'], report_paths, reports):
    assert report['planHash'] == PLAN and report['prototypeCandidateSha256'] == SOURCE
    assert not report.get('fixtureFailure') and report['sourceUnchangedDuringRun'] and report['historicalEvidenceUnchanged']
    assert report['browser']['product'] == 'Chrome/' + ('138.0.7204.183' if label == '138' else '154.0.8037.92')
    assert report['backendPrototypePassed'] is False and report['requiresIndependentReview']
    assert len(report['cases']) == 56 and all(case['status'] == 'PASS' for case in report['cases'])
    ids = {case['id'] for case in report['cases']}
    assert len(ids) == 56 and (case_ids is None or case_ids == ids)
    case_ids = ids
    assert all(value == 0 for value in report['disposedResources'].values())
    assert not report['workerTargetsAfterDispose'] and report['siteAccess']['contains']
    assert report['cleanup']['ownedBrowserExited'] and report['cleanup']['exitCode'] == 0
    assert report['cleanup']['serverClosed'] and report['cleanup']['cdpWaiters'] == 0
    races = []
    termination = []
    for case in report['cases']:
        actual = case['actual']
        if case['id'].startswith('F1-PERMISSION-AWAIT-'):
            assert actual['barrier']['apiUnchanged'] and actual['barrier']['nativeResult'] is True
            assert not actual['rawForbiddenHits'] and not actual['rawForbiddenHitsThroughBrowserExit']
            assert len(actual['rawPositiveHits']) == 1 and actual['recovery']['kind'] == 'result'
            assert actual['cleanup']['pending'] == actual['cleanup']['permissionBarriers'] == actual['cleanup']['pageWaits'] == 0
            if actual['trigger'] == 'host-close':
                assert actual['hostDestroyed'] and actual['oldTargetAfterClose']['targetId'] == actual['originalTarget']['targetId']
            else:
                assert not actual['oldDispatches'] and not actual['oldDeliveries'] and len(actual['fenced']) == 1
                assert actual['barrier']['resumedMonoMs'] >= actual['terminal']['terminalTriggeredMonoMs']
                if actual['trigger'] in ['new-run', 'new-target']:
                    assert actual['replacementLive']['active']['runId'] != actual['owner']['runId']
                    assert actual['afterReleaseWhileNewRun']['active']['runId'] == actual['replacementLive']['active']['runId']
                if actual['trigger'] == 'new-target':
                    assert actual['replacementTarget']['tabId'] != actual['barrier']['target']['tabId']
                    assert actual['replacementTarget']['documentId'] != actual['barrier']['target']['documentId']
            races.append({'caseId': case['id'], 'status': case['status'], 'rawForbiddenHits': 0,
                          'rawPositiveMethod': actual['rawPositiveHits'][0]['method'],
                          'originalRunId': actual['owner']['runId'], 'originalTarget': actual['barrier']['target']})
        if case['id'].startswith('F1-INFINITE-LOOP-'):
            assert actual['causalWorker']['verified'] and not actual['observerThroughout']
            assert actual['loopCPU'] is not None and actual['beforeCPU'] is not None and actual['loopCPU'] - actual['beforeCPU'] > 0.1
            assert actual['immediateFence'] and actual['hostResponsive'] and actual['cpuQuiescent']
            assert all(0 <= actual[key] <= 3000 for key in ['destroyedMilliseconds', 'absenceMilliseconds', 'cessationMilliseconds'])
            termination.append({'caseId': case['id'], 'status': case['status'], 'old2sContractStatus': case['old2sContractStatus'],
                                'causalPID': actual['causalWorker']['pid'], 'threadId': actual['causalWorker']['threadId'],
                                'actualBlob': actual['owner']['url'], 'targetId': actual['loopTarget']['targetId'],
                                'destroyedMilliseconds': actual['destroyedMilliseconds'], 'absenceMilliseconds': actual['absenceMilliseconds'],
                                'physicalStopMilliseconds': actual['cessationMilliseconds'], 'observerThroughout': actual['observerThroughout']})
    assert len(races) == 10 and len(termination) == 3
    resources = report['resourceRounds']
    assert len(resources) == 20 and len({item['owner']['runId'] for item in resources}) == 20
    for item in resources:
        blob = item['blob']
        assert item['status'] == 'PASS' and item['owner']['url'] == blob['url'] == item['bound']['identity']['url']
        assert item['positive']['sandboxEpoch'] == item['owner']['sandboxEpoch'] == item['retired']['sandboxEpoch']
        assert blob['runId'] == item['owner']['runId'] and blob['positive']['loaded']
        assert blob['positive']['url'] == blob['negative']['url'] == blob['url']
        assert blob['positive']['finishedMonoMs'] <= blob['revokedMonoMs'] <= blob['negative']['startedMonoMs']
        assert not blob['negative']['loaded'] and not blob['negative'].get('timedOut') and blob['negative']['error']
        assert blob['creatingOrigin'] == blob['positive']['creatingOrigin'] == blob['negative']['creatingOrigin'] == 'null'
        assert all(value == 0 for value in blob['actual'].values()) and item['destroyed'] and not item['afterTargets']
        assert item['cleanup'] == report['resourceBaseline']
        if item['outcome'] in ['cancel', 'timeout']:
            assert item['liveResources']['pageWaits'] == item['liveResources']['pending'] == item['liveResources']['timer'] == 1
    matrix.append({'version': report['browser']['product'], 'report': relative(path), 'sourceSha256': SOURCE, 'planHash': PLAN,
                   'PASS': 56, 'FAIL': 0, 'browser': report['browser'], 'siteAccess': report['siteAccess'],
                   'raceCases': races, 'termination': termination, 'resourceRounds': 20,
                   'liveObserverBeforeCancelOrTimeout': 10, 'cleanup': report['cleanup'], 'disposedResources': report['disposedResources']})
save('final-matrix.json', matrix)

historical = json.loads((DOC / 'historical-before.json').read_text())
review_before = json.loads((DOC / 'independent-review-before.json').read_text())
assert all(digest(ROOT / row['path']) == row['sha256'] for row in historical + review_before)
save('historical-immutability-final.json', {'unchanged': True, 'historicalFiles': len(historical),
     'independentCounterReportFiles': len(review_before), 'baseline': 'historical-before.json',
     'counterBaseline': 'independent-review-before.json', 'oldSourceSha256': '711f26eb86374be69617a8c638ba3736cf27c96b3bff437def5c8f37681a28d1'})

old_map = json.loads((ROOT / 'docs/framework/prototypes/user-control-v2/m5-20261002-k1/final-contract-mapping.json').read_text())
details = {row['contractId'].split(':')[0]: row for row in old_map['requiredControlContracts']}
contract_path = ROOT / 'docs/framework/reviews/migration-execution-v5/round-6/candidate/stage0/f1-cases.json'
contracts = json.loads(contract_path.read_text())
mapping = []
for contract in contracts:
    contract_id = contract['id']
    if contract_id.startswith('F1-PAGE-'):
        disposition = 'OUTSIDE_K1_WRITE_SCOPE_PAGE_LANE_AND_INDEPENDENT_UNION_REQUIRED'
        linked_cases = []
    else:
        disposition = 'K1_AUTHOR_EXECUTED_INDEPENDENT_REVIEW_PENDING'
        linked_cases = list(details[contract_id]['caseIds'])
        if contract_id == 'F1-CTRL-TRUE-TERMINATE':
            linked_cases.extend(sorted(case_id for case_id in case_ids if case_id.startswith('F1-PERMISSION-AWAIT-')))
        if contract_id == 'F1-VERSION-MATRIX':
            disposition = 'K1_CONTROL_SLICE_EXECUTED_PAGE_DIMENSIONS_REQUIRE_UNION_REVIEW'
            linked_cases = sorted(case_ids)
        assert all(case_id in case_ids for case_id in linked_cases)
    mapping.append({'id': contract_id, 'required': contract['required'], 'approvedExpected': contract['expected'],
                    'disposition': disposition, 'K1CaseIds': linked_cases,
                    'evidence': [relative(path) for path in report_paths] if linked_cases else [],
                    'authorPassByVersion': {row['version']: all(any(c['id'] == case_id and c['status'] == 'PASS'
                                                    for c in report['cases']) for case_id in linked_cases)
                                          for row, report in zip(matrix, reports)} if linked_cases else None})
assert len(mapping) == 12
save('final-contract-mapping.json', {'planHash': PLAN, 'approvedContracts': file_row(contract_path),
     'sourceSha256': SOURCE, 'contracts': mapping, 'nativePendingPermissionRegression': relative(probe_dir / 'report.json'),
     'limitations': ['K1 author execution cannot close independent reviewer disposition or authorize F2.',
                     'Five page contracts and page dimensions of VERSION-MATRIX belong to the page lane; combine frozen lanes for independent review.',
                     'Finite reviewer-derived probe uses Playwright native delegates and may attach finite Workers; it supplies no loop timing proof.',
                     'Full native loop proofs use fresh uninspected domains before CSP/resource observation; approved 3s oracle is unchanged.',
                     'Headless real Chrome extension WebUI/permissions grant state is recorded; no headed human interaction is claimed.'],
     'backendPrototypePassed': False, 'F2': False, 'requiresIndependentReview': True})

closure = {'sourceSha256': SOURCE, 'planHash': PLAN, 'officialIndependentReviewPreserved': review_before,
           'disposition': 'AUTHOR_REMEDIATED_WITH_REAL_BROWSER_EVIDENCE_INDEPENDENT_CLOSURE_PENDING',
           'CR-F1-CTRL-001': {'fix': 'Immutable entry owner/host/sandbox/run/target snapshot; irreversible cancellation; original owner checked after permissions and before every native effect; no continuation rebind.',
                              'fullRegressionCasesPerVersion': 10, 'rawForbiddenServerEffectsPerVersion': 0,
                              'nativePendingPromiseChecks': probe_checks, 'rawProbe': relative(probe_dir / 'raw-stdout.json'),
                              'executedProbeSource': file_row(probe_dir / 'probe.mjs')},
           'CR-F1-CTRL-002': {'fix': 'Each of 20 runs independently loads its actual Blob before revoke and rejects that same URL after revoke in the creating opaque realm, before any realm retirement; native exact Worker destroyed/absent; real DOM observer exists before timeout/cancel.',
                              'roundsPerVersion': 20, 'liveDOMObserverRoundsPerVersion': 10,
                              'evidence': [relative(path) + '#resourceRounds' for path in report_paths]},
           'backendPrototypePassed': False, 'F2': False}
save('blocker-closure-evidence.json', closure)

audit_reports = []
for name in ['m5-round6-race-check-138.log', 'm5-round6-final-138.log', 'm5-round6-final-154.log',
             'm5-round6-owner-guard-final-138.log', 'm5-round6-owner-guard-final-154.log']:
    data = json.loads((LANE / name).read_text())
    audit_reports.append(json.loads(Path(data['report']).read_text()))
probe_profiles = [run['profile'] for run in probe['runs']]
old_probe_dir = Path((LANE / 'm5-round6-native-probe-path.txt').read_text().strip())
old_probe = json.loads((old_probe_dir / 'report.json').read_text())
probe_profiles.extend(run['profile'] for run in old_probe['runs'])
profiles = [report['cleanup']['ownedProfile'] for report in audit_reports] + probe_profiles
groups = {report['cleanup']['ownedBrowserPid'] for report in audit_reports}
listing = subprocess.run(['ps', '-axo', 'pid=,ppid=,pgid=,command='], capture_output=True, text=True, check=True).stdout
remaining = []
for line in listing.splitlines():
    fields = line.strip().split(None, 3)
    if len(fields) == 4 and (int(fields[2]) in groups or any(profile in fields[3] for profile in profiles)):
        remaining.append(line.strip())
assert not remaining
save('final-cleanup-audit.json', {'observedAtUtc': datetime.now(timezone.utc).isoformat(),
     'method': 'Read-only OS ps matching only recorded K1 owned profiles and native detached browser process groups',
     'ownedBrowserProcessGroups': sorted(groups), 'ownedProfiles': profiles, 'remainingOwnedProcesses': remaining,
     'allNativeOwnedBrowserExits': [report['cleanup'] for report in audit_reports],
     'nativeProbeProfilesRemoved': all(not Path(profile).exists() for profile in probe_profiles),
     'serversClosed': all(report['cleanup']['serverClosed'] for report in audit_reports) and probe['serverClosed'] and old_probe['serverClosed'],
     'finalHostResources': [report['disposedResources'] for report in reports], 'finalWorkerTargets': [report['workerTargetsAfterDispose'] for report in reports],
     'onlyOwnedResourcesClosed': True, 'browserEvidenceProfilesRetained': True, 'borrowedSentinelSurvival': [next(c for c in report['cases'] if c['id']=='F1-OWNED-MAIN-LOOP-BORROWED-BOUNDARY')['actual']['borrowedStillPresent'] for report in reports]})

old_source = json.loads((ROOT / 'docs/framework/prototypes/user-control-v2/m5-20261002-k1/final-source-manifest.json').read_text())
old_files = {item['path']: item for item in old_source['files']}
changes = [{'path': item['path'], 'oldSha256': old_files[item['path']]['sha256'], 'sha256': item['sha256']}
           for item in source['files'] if item['sha256'] != old_files[item['path']]['sha256']]
save('final-validation.json', {'sourceSha256': SOURCE, 'planHash': PLAN, 'status': 'PASS_AUTHOR_CHECKS',
     'changedSourceFiles': changes, 'checks': ['same frozen source and effective round6 hash on both full matrices',
     '56 unique required/host-race cases PASS each, no fixtureFailure', '10 native permission continuation scenarios with zero raw server effects through browser exit each version',
     'native permission unresolved at genuine microtask stop; native tabs dispatch zero on both versions',
     '20 actual Blob positive-before/revoke/negative-after observations in creating realm each version',
     'all 5 cancel and 5 timeout rounds have actual pageWaits=1/pending=1/timer=1 before terminal, then baseline',
     'exact causal Worker PID/thread/Blob target, CPU growth/quiescence/exit and destruction/absence <=3s; no loop inspector',
     'valid recovery, SW reconnect and owned MAIN / borrowed survival', 'all recorded owned groups/profiles have zero live processes; native exit0/server close/host resources0',
     '173 historical files and original two independent counter reports unchanged',
     '12 approved contract entries mapped; page contracts explicitly remain outside K1 author qualification'],
     'backendPrototypePassed': False, 'F2': False, 'requiresIndependentReview': True})

report_links = '\n'.join('- [' + item['version'] + ' full report](' + str(path) + ')' for item, path in zip(matrix, report_paths))
text = f"""K1 control replacement frozen for independent union review.

Effective round6 plan hash: {PLAN}
Final source hash: {SOURCE}

Both full native matrices: 56 PASS / 0 FAIL; same source, fresh profiles, exact 138.0.7204.183 and 154.0.8037.92.

{report_links}

CR-F1-CTRL-001: request entry captures immutable run/host/sandbox/target identity. The original owner is rechecked after permission awaits and before tabs/scripting effects; stopped operations cannot acquire a new run/tab. Ten continuation regressions per version cover goto/click under stop, deadline, host-close, new run and new target, with zero raw server effects through browser exit and genuine positive recovery. The reviewer-derived native pending-promise probe additionally confirms request -> legal stop -> actual native permission result, zero tabs.update dispatch/server requests, and a later genuine run on both versions. Official independent closure remains pending.

CR-F1-CTRL-002: all 20 outcome rounds now load their original actual Blob before revoke and fail that same URL after revoke in its creating opaque realm before teardown; each exact Worker is independently destroyed/absent and resources return to baseline. All five cancel/five timeout rounds record real pageWaits=1/pending=1/timer=1 before trigger, then zero.

Changed source: fixture/host.js, fixture/sandbox.html, run-native.mjs, run.mjs. Backend, permissions and 3s oracle are unchanged. Physical loop proofs still record the old 2s STOP/DEADLINE FAIL diagnostics. No loop Worker or creator inspector is attached.

[12-contract mapping]({DOC / 'final-contract-mapping.json'}), [full matrix]({DOC / 'final-matrix.json'}), [blocker closure evidence]({DOC / 'blocker-closure-evidence.json'}), [cleanup audit]({DOC / 'final-cleanup-audit.json'}), [source manifest]({DOC / 'final-source-manifest.json'}), [evidence manifest]({DOC / 'final-evidence-manifest.json'}).

173 prior artifacts, original 711f/46 PASS exports, round4 failures and original independent HIGH/counter report bytes remain unchanged. Intermediate fb58 matrix/probe and the early HOST-CLOSE sampling failure are retained as separate evidence, not final qualification. All five native run browser groups are gone (exit0); local servers closed; final host resources/Worker sets zero; borrowed sentinel survived adapter disposal. Probe profiles were removed, evidence browser profiles retained.

Five page contracts and page dimensions of VERSION-MATRIX are explicitly mapped to the other lane, not claimed by K1. Headless native UI/permissions grant state is saved. Author evidence does not qualify the union or product migration: backendPrototypePassed=false; F2=false; independent review required. No product/public gate/shared browser files were changed.
"""
(DOC / 'final-handoff.md').write_text(text)

evidence_paths = [path for report_path in report_paths for path in report_path.parent.iterdir() if path.is_file()]
evidence_paths.extend(path for path in probe_dir.iterdir() if path.is_file())
evidence_paths.extend(path for path in DOC.iterdir() if path.is_file() and path.name not in ['final-evidence-manifest.json', 'final-evidence-manifest.sha256'])
save('final-evidence-manifest.json', {'schema': 1, 'kind': 'K1 frozen author source/evidence replacement; independent union review required',
     'createdAtUtc': datetime.now(timezone.utc).isoformat(), 'planHash': PLAN, 'sourceSha256': SOURCE,
     'fullReports': [relative(path) for path in report_paths], 'nativePendingPromiseProbe': relative(probe_dir / 'report.json'),
     'files': [file_row(path) for path in sorted(set(evidence_paths))], 'profileFilesExcluded': 'Browser cache/profile state is not proof; fresh owned path, binary/OS/version/identity and final process audit are recorded.',
     'backendPrototypePassed': False, 'F2': False, 'requiresIndependentReview': True})
evidence_hash = digest(DOC / 'final-evidence-manifest.json')
(DOC / 'final-evidence-manifest.sha256').write_text(evidence_hash + '  final-evidence-manifest.json\n')
print(json.dumps({'sourceSha256': SOURCE, 'evidenceSha256': evidence_hash, 'versions': ['56 PASS / 0 FAIL', '56 PASS / 0 FAIL'],
                  'contracts': len(mapping), 'historicalFilesUnchanged': len(historical), 'remainingOwnedProcesses': len(remaining)}))
