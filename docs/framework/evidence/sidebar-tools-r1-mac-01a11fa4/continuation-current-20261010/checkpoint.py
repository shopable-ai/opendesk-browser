"""Write an honest continuation checkpoint; retain every earlier candidate."""
import datetime
import json
import subprocess
from pathlib import Path

root = Path.cwd()
evidence = root / 'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/continuation-current-20261010'
native = evidence / 'native-final-e3ed'
load = lambda p: json.loads(p.read_text())
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
snapshot = load(evidence / 'final-current-main/start.json')['snapshot']
script = 'import {packageFingerprint} from "./scripts/verify-package.mjs";console.log(JSON.stringify(await packageFingerprint(process.argv[1])))'
package = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script,
    str(Path(snapshot) / 'dist/production')], text=True))
cleanup = load(native / 'cleanup.json')
assert cleanup['cleanupStatus'] == 'PASS' and not cleanup['residual']
assert cleanup['profileRemoved'] and not cleanup['pidAliveAfterExit']
components = load(evidence / 'final-current-main/component-test-retry-result.json')
assert components['status'] == 'CI_PASS'
record = {
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceCommit': sha,
    'status': 'R1_NATIVE_EVIDENCE_INCOMPLETE',
    'blockingCondition': 'Mac locked; CUA automatic unlock failed. Human unlock requested in this chat. No locked-screen input bypass attempted.',
    'latestProduct': {'sourceCommit': 'c44ccaa995e5f482e2b94c5927e799ae3ea34d26',
        'equivalentMain': sha, 'snapshot': snapshot, 'packageHash': package['packageHash'],
        'nativeStatus': 'NATIVE_NOT_VERIFIED',
        'productionDeltaFromNativeE3ed': ['native-agent/transport.js', 'sw.js', 'ui/tool-shell.js']},
    'latestLocalCI': {'status': 'CI_PASS', 'components': 547, 'pass': 547, 'fail': 0,
        'excludedFile': 'native-agent-chrome-real.test.mjs', 'excludedNativeCases': 2,
        'scope': 'Component suite only; not full npm test PASS for latest main',
        'engineering': 'final-current-main/engineering.json',
        'rebuildAndRetest': 'final-current-main/component-test-retry-result.json',
        'preservedFailure': 'final-current-main/component-test.log',
        'failureCause': 'Test-only archive overlay restored tracked historical bundle receipts; rebuilding regenerated exact receipts and fixed both provenance failures'},
    'priorFullNpmTest': {'sourceCommit': 'e3ed1a1e55d179588f259640129f6ad492d600ff',
        'status': 'CI_PASS', 'tests': 539, 'pass': 539, 'fail': 0, 'skip': 0,
        'log': 'final-integrated/npm-test-retry2.log',
        'scope': 'Includes two actual Chrome cases; prior candidate, not latest main'},
    'remoteCI': {'sourceCommit': '4fd0430f810781b3b21434d987b1e227d615dd8a',
        'status': 'CI_PASS', 'successfulWorkflows': 6,
        'receipt': 'github-ci-final-observed.json',
        'scope': 'Observed remote SHA only; no push or latest-main remote PASS claimed'},
    'scopedNative': {'sourceCommit': 'e3ed1a1e55d179588f259640129f6ad492d600ff',
        'packageHash': load(native / 'session.json')['package']['packageHash'],
        'browserVersion': load(native / 'session.json')['version']['product'],
        'status': 'NATIVE_PASS for enumerated cases only',
        'passed': ['Selection does not install/execute', 'Explicit installation and HTML/CSS/local PNG',
            'Current business title and URL', 'Chinese note save and whole-process restart durability',
            'Task v1 matching verified source installation, jump without execution, Run/Stop/results/history',
            '20 tool destruction/recreation cycles', 'Actual sandbox privileged API isolation and forged/replayed message rejection',
            'Navigation, second window binding and business-tab offline/recovery',
            'Original computation sandbox CSP', 'Precompiled React/Tailwind and Vue classic JS/static CSS',
            'Tool storage namespace isolation', 'Update preservation, capability revocation and native cancel/confirm',
            '400/320/200 CSS px measured layouts', 'Fixed launcher cleanup after same-profile restart'],
        'remainingOnThisCandidate': ['600 CSS px', 'Native Save/refresh interaction at 200% zoom',
            'Uninstall cancel/accept and isolation'],
        'cleanupStatus': 'PASS', 'cleanupReceipt': 'native-final-e3ed/cleanup.json',
        'resources': 'All owned Chrome PIDs exited; private profile removed; borrowed 43111 server untouched'},
    'sourceFixCommitsThisContinuation': ['b221cf5966e27785523626a31c04e7fbe25870ee',
        'e3ed1a1e55d179588f259640129f6ad492d600ff', '30a0a94dc4d07e82929d5d800f957ed1bd0448d9'],
    'sourceFixFilesThisContinuation': ['tests/framework/sidebar-tools-native-probes.mjs',
        'tests/framework/k5-sdk-native-launcher.mjs',
        'tests/environment/native-tool-navigation-driver.test.mjs',
        'tests/environment/native-sidepanel-driver-target.test.mjs'],
    'correction': '30a0a94d Tested trailer says four target/navigation cases; the actual log has six Node test cases. Preserved log is authoritative.',
    'compilerSupport': {'precompiledReactTailwind': 'NATIVE_PASS on scoped e3ed package',
        'precompiledVue': 'NATIVE_PASS on scoped e3ed package',
        'directJSX_TSX_Vue_TailwindSource': 'NOT_SUPPORTED'},
    'qualityScores': {'status': 'DEFERRED', 'reason': 'Latest-package Native acceptance remains incomplete; no 95/100 final rating awarded'},
    'next': ['Unlock Mac', 'Use exact latest built production package for impacted Native acceptance',
        'Finish genuine widths/200% inputs/uninstall isolation', 'Run latest two Native npm cases with genuine permission input',
        'Close exact candidate ledger and deliver verified dist; keep old failures and candidate identities'],
    'finalF3': 'NOT_CLAIMED', 'zipInstallation': 'NOT_CLAIMED', 'releasePublish': 'NOT_PERFORMED'
}
(evidence / 'checkpoint.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
ledger_path = root / 'docs/framework/workstreams/sidebar-tools-r1-mac-01a11fa4.json'
ledger = load(ledger_path)
ledger.setdefault('continuations', []).append({'at': record['at'], 'status': record['status'],
    'sourceCommit': sha, 'receipt': 'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/continuation-current-20261010/checkpoint.json',
    'latestLocalCIStatus': 'CI_PASS', 'latestNativeStatus': 'NATIVE_NOT_VERIFIED',
    'ownedNativeResource': 'RELEASED', 'blockingCondition': record['blockingCondition']})
ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sourceCommit': sha, 'packageHash': package['packageHash'],
    'status': record['status'], 'components': 547, 'cleanup': 'PASS'}, ensure_ascii=False))
