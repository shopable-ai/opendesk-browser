#!/usr/bin/python3
"""CI entry for pinned CFT with an owned profile, loopback CDP and mock keychain."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    options, browser_args = parser.parse_known_args()
    executable = options.executable.resolve()
    suffix = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    if not str(executable).endswith(suffix) or not executable.is_file() or not os.access(executable, os.X_OK):
        parser.error('Pin an executable from the complete official Chrome for Testing app')
    for arg in browser_args:
        if arg.split('=', 1)[0] in ('--user-data-dir', '--remote-debugging-address', '--password-store', '--use-mock-keychain'):
            parser.error('The launcher owns profile, loopback and keychain flags')
    if options.report.exists():
        parser.error('A fresh report is required; preserve original launch evidence')
    os.umask(0o077)
    profile = Path(tempfile.mkdtemp(prefix='opendesk-cft-'))
    arguments = [str(executable), '--use-mock-keychain', '--password-store=basic',
                 '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile)] + browser_args
    child = None
    try:
        with (profile / 'chrome.log').open('wb') as log:
            child = subprocess.Popen(arguments, stdout=log, stderr=log)
            def forward(signum, _frame):
                if child.poll() is None:
                    child.send_signal(signum)
            for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(signum, forward)
            metadata = {'pid': child.pid, 'profile': str(profile), 'executable': str(executable),
                        'args': arguments, 'log': str(profile / 'chrome.log')}
            options.report.write_text(json.dumps(metadata, indent=2) + '\n')
            print(json.dumps(metadata), flush=True)
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
    raise SystemExit(main())
