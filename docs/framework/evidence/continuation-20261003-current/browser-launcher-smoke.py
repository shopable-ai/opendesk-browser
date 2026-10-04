#!/usr/bin/python3
"""Verify the global CFT launcher on fresh profiles; no extension is loaded."""
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
OUTPUT = Path(__file__).resolve().parent
LAUNCHER = Path('/Users/shopme/.codex/browser-testing/launch.py')
VERSIONS = ['138.0.7204.183', '154.0.8037.92']
results = []

for version in VERSIONS:
    executable = ROOT / 'tests/.cache/m5-browsers' / version / 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    receipt = OUTPUT / f'launcher-metadata-{version}.json'
    receipt.unlink(missing_ok=True)
    command = ['/usr/bin/python3', str(LAUNCHER), '--executable', str(executable), '--report', str(receipt),
               '--headless=new', '--remote-debugging-port=0', 'about:blank']
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    row = {'versionLabel': version, 'command': command, 'extensionLoaded': False, 'nativeProductTest': False}
    metadata = None
    try:
        until = time.monotonic() + 20
        while not receipt.exists() and process.poll() is None and time.monotonic() < until:
            time.sleep(.1)
        if not receipt.exists():
            raise RuntimeError('Global launcher did not issue metadata')
        metadata = json.loads(receipt.read_text())
        row['metadata'] = metadata
        profile = Path(metadata['profile'])
        assert profile.name.startswith('codex-cft-') and profile.is_dir()
        actual = subprocess.check_output(['/bin/ps', '-ww', '-p', str(metadata['pid']), '-o', 'command='], text=True).strip()
        row['actualMainProcessArguments'] = actual
        assert str(executable) in actual
        assert '--use-mock-keychain' in actual and '--user-data-dir=' + str(profile) in actual
        assert '--headless=new' in actual and '--remote-debugging-port=0' in actual
        row['freshExplicitProfile'] = True
        port_file = profile / 'DevToolsActivePort'
        while not port_file.exists() and process.poll() is None and time.monotonic() < until:
            time.sleep(.1)
        port = int(port_file.read_text().splitlines()[0])
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=5) as response:
            row['actualCdpVersion'] = json.load(response)
        assert row['actualCdpVersion']['Browser'].split('/')[-1] == version
        row['passed'] = True
    except Exception as error:
        row['passed'] = False
        row['error'] = str(error)
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            # Kill only this owned CFT process. Keep launcher alive to remove its profile.
            if metadata:
                try:
                    os.kill(metadata['pid'], signal.SIGKILL)
                except ProcessLookupError:
                    pass
            stdout, stderr = process.communicate(timeout=10)
        row['launcherExitCode'] = process.returncode
        row['launcherStdout'] = stdout
        row['launcherStderr'] = stderr
        row['profileRemoved'] = bool(metadata) and not Path(metadata['profile']).exists()
        if metadata:
            remaining = subprocess.run(['/bin/ps', '-p', str(metadata['pid']), '-o', 'pid='], capture_output=True, text=True)
            row['mainProcessStopped'] = remaining.returncode != 0 or not remaining.stdout.strip()
        else:
            row['mainProcessStopped'] = False
        row['passed'] = row.get('passed', False) and row['profileRemoved'] and row['mainProcessStopped']
    results.append(row)
    print(json.dumps({key: row.get(key) for key in ['versionLabel', 'passed', 'profileRemoved', 'mainProcessStopped', 'error']}), flush=True)

report = {'purpose': 'global launcher argv/fresh profile smoke only; not SDK/F3 acceptance', 'results': results,
          'passed': len(results) == 2 and all(row['passed'] for row in results)}
(OUTPUT / 'browser-launcher-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
raise SystemExit(0 if report['passed'] else 1)
