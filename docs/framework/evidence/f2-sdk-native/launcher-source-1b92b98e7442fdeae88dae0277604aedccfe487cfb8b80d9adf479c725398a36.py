#!/usr/bin/python3
"""Start an isolated Chrome for Testing without accessing the login keychain."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile

SUFFIX = Path('Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')


def resolve_executable(explicit=None):
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if path.suffix == '.app':
            path = path / 'Contents/MacOS/Google Chrome for Testing'
    else:
        roots = [Path.home() / 'Documents/workspace/opendesk-browser/tests/.cache/m5-browsers',
                 Path.home() / 'Library/Caches/ms-playwright']
        candidates = [p for root in roots if root.exists()
                      for p in root.glob('**/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')]
        candidates += [p / 'Contents/MacOS/Google Chrome for Testing'
                       for p in (Path('/Applications/Google Chrome for Testing.app'),
                                 Path.home() / 'Applications/Google Chrome for Testing.app') if p.exists()]
        def version(path):
            matches = re.findall(r'\d+\.\d+\.\d+\.\d+', str(path))
            return tuple(map(int, matches[-1].split('.'))) if matches else (0,)
        candidates = sorted(set(candidates), key=lambda p: (version(p), str(p)), reverse=True)
        path = next((p for p in candidates if os.access(p, os.X_OK)), None)
    if path is None or not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError('Chrome for Testing executable not found; specify --executable /absolute/path/to/app-or-binary')
    if path.name != 'Google Chrome for Testing' or not str(path).endswith(str(SUFFIX)):
        raise ValueError('This launcher only accepts Chrome for Testing, not your personal Chrome')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', help='Pin a Chrome for Testing .app or executable')
    parser.add_argument('--report', type=Path, help='Write launch metadata as JSON')
    parser.add_argument('--resolve-only', action='store_true', help='Print selected executable without starting it')
    options, browser_args = parser.parse_known_args()
    if browser_args[:1] == ['--']:
        browser_args.pop(0)
    try:
        executable = resolve_executable(options.executable)
        for arg in browser_args:
            if arg.split('=', 1)[0] in ('--user-data-dir', '--remote-debugging-address', '--password-store'):
                raise ValueError('The launcher owns isolated profile, loopback address, and password-store settings')
            if arg.startswith('--use-mock-keychain='):
                raise ValueError('Do not override --use-mock-keychain')
    except ValueError as error:
        parser.error(str(error))
    if options.resolve_only:
        print(json.dumps({'executable': str(executable)}, ensure_ascii=False))
        return 0
    os.umask(0o077)
    profile = Path(tempfile.mkdtemp(prefix='codex-cft-'))
    arguments = [str(executable), '--use-mock-keychain', '--password-store=basic',
                 '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
                 '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile)]
    arguments += browser_args or ['about:blank']
    child = None
    def forward(signum, _frame):
        if child is not None and child.poll() is None:
            child.send_signal(signum)
    try:
        with (profile / 'chrome.log').open('wb') as log:
            child = subprocess.Popen(arguments, stdout=log, stderr=log)
            for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(signum, forward)
            metadata = {'pid': child.pid, 'profile': str(profile), 'executable': str(executable),
                        'args': arguments, 'log': str(profile / 'chrome.log')}
            if options.report:
                options.report.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps(metadata, ensure_ascii=False), flush=True)
            returncode = child.wait()
            return returncode if returncode >= 0 else 128 - returncode
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
