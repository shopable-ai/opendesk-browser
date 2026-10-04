#!/usr/bin/env python3
"""Read-only verification of the saved-r1 prefix of a native controller run.

This does not launch Chrome, modify product state, or pass the parent test case.
It binds the revision file to the actual read-only IDB response in raw CDP.
"""
import argparse
import hashlib
import json
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def package_hash(directory):
    rows = []
    for path in sorted(directory.rglob('*'), key=lambda item: item.relative_to(directory).as_posix()):
        require(not path.is_symlink(), 'Package contains a symlink')
        if path.is_file():
            data = path.read_bytes()
            rows.append({'path': path.relative_to(directory).as_posix(),
                         'bytes': len(data), 'sha256': sha(data)})
    return sha(json.dumps(rows, separators=(',', ':'), ensure_ascii=False).encode())


def inspect_transcript(report, inputs, revision, messages, permission):
    """Return bounded facts; preserve the original case status and incomplete chain."""
    case = next((row for row in report['cases']
                 if row['id'] == 'OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN'), None)
    require(case is not None, 'Original native case is missing')
    require(case['status'] == 'BLOCKED' and case['error']['code'] == 'E_NATIVE_PERMISSION_WAIT',
            'This verifier requires the real permission-blocked saved-r1 observation')
    require(report['mode'] == 'production', 'Development evidence cannot prove production')
    require(report['packageDrift'] is False and report['launcherDrift'] is False,
            'Native run inputs drifted')
    require(report['cleanup']['pidAlive'] is False and
            report['cleanup']['launcherPidAlive'] is False and
            report['cleanup']['profileRemoved'] is True,
            'Native session teardown is not complete')
    require(permission['ui']['state'] == 'authorizing' and permission['ui']['runId'] == '',
            'The observed run boundary differs')
    require(permission['permissions']['origins'] == [], 'Permission state differs')
    require(permission['pid'] == report['pid'] and permission['endpoint'] == report['endpoint'],
            'Permission observation belongs to a different browser')
    endpoint = f"production-{report['label']}-{permission['toolId']}"
    request_map, exchanges = {}, []
    for line, row in enumerate(messages, 1):
        message = row['message']
        key = (row['endpoint'], message.get('id'))
        if row['direction'] == 'sent' and 'id' in message:
            require(key not in request_map, 'Duplicate CDP request identity')
            request_map[key] = (line, row)
        elif row['direction'] == 'received' and 'id' in message and key in request_map:
            request_line, request = request_map[key]
            if row['endpoint'] == endpoint:
                exchanges.append((request_line, line, request['message'], message))

    source = case['input']['source']
    require(revision['sourceUtf8'] == source and revision['contentHash'] == sha(source.encode()),
            'Committed revision/source SHA256 mismatch')
    require(revision['tag'] == 'script-revision' and revision['revision'] == 1 and
            revision['parentRevision'] == 0 and
            revision['namespace'] == f"tool:{report['extensionId']}", 'Saved-r1 identity differs')
    expected = {'#script-id': revision['scriptId'], '#script-source': source,
                '#script-params': json.dumps(case['input']['params'], separators=(',', ':'), ensure_ascii=False)}
    input_proofs = []
    for selector, value in expected.items():
        matching = [row for row in inputs if row['selector'] == selector]
        require(len(matching) == 1, f'Unique actual input required: {selector}')
        entry = matching[0]
        selection = entry['selected']
        require(selection['focused'] is True and selection['start'] == 0 and
                selection['end'] == len(selection['value'].encode('utf-16-le')) // 2,
                f'Native selection did not replace input: {selector}')
        require(entry['actual'] == value and entry['expected'] == value and
                entry['targetId'] == permission['toolId'], f'Actual input differs: {selector}')
        selections = [exchange for exchange in exchanges if exchange[2].get('method') == 'Runtime.evaluate'
                      and json.dumps(selector) in exchange[2].get('params', {}).get('expression', '')
                      and exchange[3].get('result', {}).get('result', {}).get('value') == selection
                      and 'exceptionDetails' not in exchange[3].get('result', {})]
        require(len(selections) == 1, f'Raw native selection is missing/ambiguous: {selector}')
        selection_end = selections[0][1]
        insertions = [exchange for exchange in exchanges if exchange[0] > selection_end
                      and exchange[2].get('method') == 'Input.insertText'
                      and exchange[2].get('params', {}).get('text') == value and 'error' not in exchange[3]]
        require(len(insertions) == 1, f'Raw native text input is missing/ambiguous: {selector}')
        insertion_end = insertions[0][1]
        echoes = [exchange for exchange in exchanges if exchange[0] > insertion_end
                  and exchange[2].get('method') == 'Runtime.evaluate'
                  and json.dumps(selector) in exchange[2].get('params', {}).get('expression', '')
                  and exchange[3].get('result', {}).get('result', {}).get('value') == value
                  and 'exceptionDetails' not in exchange[3].get('result', {})]
        require(len(echoes) == 1, f'Raw UI input echo is missing/ambiguous: {selector}')
        input_proofs.append({'selector': selector, 'selectionLines': selections[0][:2],
                             'insertLines': insertions[0][:2], 'echoLines': echoes[0][:2]})

    snapshots = []
    for request_line, response_line, request, response in exchanges:
        expression = request.get('params', {}).get('expression', '')
        value = response.get('result', {}).get('result', {}).get('value')
        if request.get('method') != 'Runtime.evaluate' or not isinstance(value, dict):
            continue
        if 'rows' in value and "indexedDB.open('opendesk-browser')" in expression and "'readonly'" in expression:
            require('error' not in response and 'exceptionDetails' not in response.get('result', {}), 'IDB read failed')
            matches = [row for row in value['rows'].get('scriptRevisions', []) if row['value'] == revision]
            if matches:
                require(len(matches) == 1, 'Duplicate immutable revision in raw IDB')
                require(matches[0]['key'] == 'script:' + json.dumps(
                    [revision['namespace'], revision['scriptId'], 1], separators=(',', ':')), 'Revision key differs')
                heads = [row['value'] for row in value['rows'].get('scriptHeads', [])
                         if row['value'].get('scriptId') == revision['scriptId']]
                require(len(heads) == 1 and heads[0]['revision'] == 1 and
                        heads[0]['tag'] == 'script-head' and heads[0]['namespace'] == revision['namespace'] and
                        heads[0]['contentHash'] == revision['contentHash'] and heads[0]['tombstoned'] is False,
                        'Committed head does not match r1')
                require(value['rows'].get('runs') == [] and value['rows'].get('results') == [],
                        'Pre-admission snapshot already contains runs/results')
                require(not any(row['value'].get('tag') in ['controller-admission', 'controller-operation', 'script-revision-pin']
                                for row in value['rows'].get('commandJournal', [])), 'Snapshot already contains controller work')
                snapshots.append({'requestLine': request_line, 'responseLine': response_line,
                                  'revisionKey': matches[0]['key'], 'database': value['databases']})
    require(len(snapshots) == 1, 'Unique raw read-only committed-r1 snapshot required')
    # Bind the stored row to the real save button, native mouse input and saved
    # UI state. A revision-file assertion by itself cannot prove a workbench save.
    last_echo = max(proof['echoLines'][1] for proof in input_proofs)
    positions = [exchange for exchange in exchanges if exchange[0] > last_echo
                 and exchange[2].get('method') == 'Runtime.evaluate'
                 and json.dumps('#script-save') in exchange[2].get('params', {}).get('expression', '')
                 and 'getBoundingClientRect' in exchange[2].get('params', {}).get('expression', '')
                 and isinstance(exchange[3].get('result', {}).get('result', {}).get('value'), dict)]
    require(len(positions) == 1, 'Unique real save-button position required')
    position = positions[0][3]['result']['result']['value']
    require(position.get('disabled') is False, 'Save button was disabled')
    clicks = []
    for kind in ['mousePressed', 'mouseReleased']:
        candidates = [exchange for exchange in exchanges if exchange[0] > positions[0][1]
                      and exchange[1] < snapshots[0]['requestLine']
                      and exchange[2].get('method') == 'Input.dispatchMouseEvent'
                      and all(exchange[2].get('params', {}).get(key) == wanted for key, wanted in
                              {'type': kind, 'x': position['x'], 'y': position['y'],
                               'button': 'left', 'clickCount': 1}.items())
                      and 'error' not in exchange[3]]
        require(len(candidates) == 1, f'Unique native save-button {kind} required')
        clicks.append(candidates[0])
    require(clicks[0][1] < clicks[1][0], 'Native save click order differs')
    saved_states = []
    for request_line, response_line, request, response in exchanges:
        value = response.get('result', {}).get('result', {}).get('value')
        if (request_line > clicks[1][1] and response_line < snapshots[0]['requestLine'] and
                request.get('method') == 'Runtime.evaluate' and
                'script-status' in request.get('params', {}).get('expression', '') and
                isinstance(value, dict) and value.get('state') == 'saved'):
            require(json.loads(value['result']) == {'scriptId': revision['scriptId'], 'revision': 1,
                                                   'contentHash': revision['contentHash']}, 'Saved UI identity differs')
            require(value['runId'] == '' and value['runDisabled'] is False, 'Saved UI has not reached runnable state')
            saved_states.append([request_line, response_line])
    require(len(saved_states) == 1, 'Unique saved UI state before committed-r1 read required')
    return {'scope': 'native UI input and committed immutable r1 only', 'savePrefixVerified': True,
            'originalCaseStatus': case['status'], 'originalCasePassed': False,
            'revision': revision, 'nativeInputProofs': input_proofs, 'idbReadProof': snapshots[0],
            'nativeSaveProof': {'buttonPositionLines': positions[0][:2], 'mousePressedLines': clicks[0][:2],
                                'mouseReleasedLines': clicks[1][:2], 'savedStateLines': saved_states[0]},
            'runStatus': 'BLOCKED', 'reason': case['error']['code'],
            'notProved': ['admission', 'run context', 'controller execution', 'runtime params binding',
                          'r1/r2 isolation', 'pin/tombstone/GC', 'return/error/stop',
                          'durable run result', 'download complete/disk hash', 'product resource baselines'],
            'f3Accepted': False, 'original603Closed': False}


def verify(directory, expected_hash, labels):
    refs = {}

    def load(file, lines=False):
        file = file.resolve()
        data = file.read_bytes()
        refs[str(file)] = {'path': str(file), 'bytes': len(data), 'sha256': sha(data)}
        return [json.loads(row) for row in data.splitlines()] if lines else json.loads(data)

    require(len(expected_hash) == 64 and all(c in '0123456789abcdef' for c in expected_hash), 'Explicit package SHA256 required')
    require(sorted(labels) == ['138', '154'], 'Both supported production environments are required, once each')
    raw = load(directory / 'raw-cdp.jsonl', lines=True)
    rows = []
    package_directories = set()
    for label in labels:
        session = directory / f'production-{label}'
        report = load(session / 'report.json')
        require(report['label'] == label and report['packageHash'] == expected_hash, 'Session candidate differs')
        package = Path(report['extension']).resolve()
        require(package_hash(package) == expected_hash, 'Current production package differs from native evidence')
        package_directories.add(package)
        inputs = load(session / 'ui-input.jsonl', lines=True)
        permission = load(session / 'native-permission-state.json')
        files = list(session.glob('revision-*-r1.json'))
        require(len(files) == 1, 'Unique recorded r1 file required')
        revision = load(files[0])
        try:
            row = inspect_transcript(report, inputs, revision, raw, permission)
        except (ValueError, KeyError, TypeError) as error:
            original = next((case for case in report['cases']
                             if case['id'] == 'OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN'), {})
            row = {'scope': 'saved-r1 prefix rejected by evidence checks',
                   'savePrefixVerified': False, 'verificationError': str(error),
                   'originalCaseStatus': original.get('status'), 'originalCasePassed': False,
                   'nativeInputDrift': {'package': report.get('packageDrift'),
                                        'launcher': report.get('launcherDrift')},
                   'f3Accepted': False, 'original603Closed': False}
        row['environment'] = {'mode': report['mode'], 'browser': report['completeVersion'],
                              'extensionId': report['extensionId'], 'packageHash': expected_hash}
        row['sessionCaseCounts'] = report['summary']
        rows.append(row)
    for file, ref in refs.items():
        require(sha(Path(file).read_bytes()) == ref['sha256'], 'Evidence changed while checking')
    for package in package_directories:
        require(package_hash(package) == expected_hash, 'Package changed while checking')
    return {'schemaVersion': 1, 'scope': 'saved-r1 prefix, not a product completion certificate',
            'evidenceDirectory': str(directory.resolve()), 'packageHash': expected_hash,
            'evidenceReadNoDrift': True, 'observations': rows, 'references': list(refs.values()),
            'allSavePrefixesVerified': bool(rows) and all(row['savePrefixVerified'] for row in rows),
            'f3Accepted': False, 'original603Closed': False, 'frameworkFunctionalMigrationComplete': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--package-hash', required=True)
    parser.add_argument('--browsers', default='138,154')
    args = parser.parse_args()
    try:
        result = verify(args.evidence, args.package_hash, args.browsers.split(','))
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({'savePrefixVerified': False, 'f3Accepted': False,
                          'error': str(error)}, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result['allSavePrefixesVerified']:
        raise SystemExit(1)
