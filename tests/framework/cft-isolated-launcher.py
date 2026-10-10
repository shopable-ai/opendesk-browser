#!/usr/bin/python3
"""CI entry for pinned CFT with an owned profile, loopback CDP and mock keychain.

The optional restart protocol preserves the original profile for exactly one
real Browser.close / relaunch. It uses the existing tested Lifecycle ownership
guard; neither this entry nor the driver edits Chrome preference files.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import select
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace


def restart_lifecycle_class():
    # Import only the reusable guard. Its machine-specific main() is not run.
    source = Path(__file__).with_name('k5-sdk-native-restart.py')
    spec = importlib.util.spec_from_file_location('opendesk_cft_lifecycle_guard', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Lifecycle


def run_restartable(arguments, profile, report, lifecycle_class):
    manager = lifecycle_class(report, implementation_hash=lambda: hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    log = None
    result_code = 0
    stopping = False
    current = None
    exited = set()

    def stop(_signum, _frame):
        nonlocal stopping
        # Finalization revalidates the actual Popen handle before signalling.
        stopping = True

    def check_profile():
        info = profile.lstat()
        if not stat.S_ISDIR(info.st_mode) or (info.st_dev, info.st_ino) != manager.profile_identity or info.st_mode & 0o777 != 0o700:
            raise RuntimeError('Restart refuses changed profile inode, symlink or mode')
        return info

    def note_exit(owner):
        code = owner.child.poll()
        if code is not None and owner.pid not in exited:
            exited.add(owner.pid)
            manager.event(owner, 'child-exited', returncode=code)
        return code

    def launch(generation, previous=None):
        info = check_profile()
        child = subprocess.Popen(arguments, stdout=log, stderr=log)
        owner = SimpleNamespace(child=child, pid=child.pid, arguments=list(arguments), generation=generation, profile=profile)
        manager.register_child(owner)  # First operation after acquiring Popen.
        identity = manager.inspect(child, arguments)
        metadata = dict(pid=child.pid, launcherPid=os.getpid(), profile=str(profile),
                        profileDevice=info.st_dev, profileInode=info.st_ino,
                        executable=arguments[0], args=arguments, generation=generation,
                        log=str(profile / 'chrome.log'), implementationHash=manager.implementation_hash())
        if previous is not None:
            metadata['restartObserved'] = dict(previousPid=previous.pid,
                                               previousReturncode=previous.child.returncode,
                                               sameProfile=True, sameArguments=previous.arguments == arguments)
        manager.event(owner, 'launched', identity=identity, restartObserved=metadata.get('restartObserved'))
        temporary = report.with_suffix('.next.json')
        temporary.write_text(json.dumps(metadata, indent=2) + '\n')
        temporary.replace(report)
        manager.publish(metadata)
        return owner

    try:
        manager.register_profile(profile)
        check_profile()
        log = (profile / 'chrome.log').open('w+b')
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(signum, stop)
        current = launch(1)
        while not stopping:
            code = note_exit(current)
            if code is not None and code != 0:
                raise RuntimeError('Owned Chrome exited unexpectedly: ' + str(code))
            readable, _, _ = select.select([sys.stdin], [], [], 0.2)
            if not readable:
                continue
            line = sys.stdin.readline()
            if not line:  # EOF always closes the owned lifecycle.
                break
            command = json.loads(line)
            if command != {'action': 'restart'} or current.generation != 1:
                raise RuntimeError('Only one explicit same-profile restart is supported')
            # The caller first sends real CDP Browser.close. Never substitute
            # force kill, and never start generation 2 while generation 1 lives.
            if current.child.wait(timeout=30) != 0:
                raise RuntimeError('Browser.close did not produce a normal exit')
            note_exit(current)
            check_profile()
            (profile / 'DevToolsActivePort').unlink(missing_ok=True)
            current = launch(2, previous=current)
    except Exception as error:
        manager.error(error, 'restartable-launch', kind='operation')
        result_code = 1
    finally:
        manager.cleanup_children()
        if log is not None:
            try:
                # Copy our original open file descriptor, not a possibly
                # replaced profile path, after all child writers have exited.
                log.flush()
                log.seek(0)
                report.with_suffix('.chrome.log').write_bytes(log.read())
            except Exception as error:
                manager.error(error, 'copy-owned-chrome-log')
            finally:
                log.close()
        cleanup = manager.finalize()
        if cleanup['status'] != 'PASS':
            result_code = 1
    return result_code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--same-profile-restart', action='store_true')
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
    lifecycle_class = None
    if options.same_profile_restart:
        debugging = [arg for arg in browser_args if arg.startswith('--remote-debugging-port')]
        if debugging != ['--remote-debugging-port=0'] or '--remote-debugging-pipe' in browser_args:
            parser.error('Restart evidence requires one OS-assigned loopback CDP port')
        if any(options.report.with_suffix(suffix).exists() for suffix in ('.cleanup.json', '.lifecycle.jsonl', '.chrome.log', '.next.json')):
            parser.error('Fresh restart evidence paths are required')
        # Resolve the helper before creating a private profile or child.
        lifecycle_class = restart_lifecycle_class()
    os.umask(0o077)
    profile = Path(tempfile.mkdtemp(prefix='opendesk-cft-'))
    arguments = [str(executable), '--use-mock-keychain', '--password-store=basic',
                 '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile)] + browser_args
    if options.same_profile_restart:
        return run_restartable(arguments, profile, options.report, lifecycle_class)
    # Existing callers retain the original single-generation launcher path.
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
