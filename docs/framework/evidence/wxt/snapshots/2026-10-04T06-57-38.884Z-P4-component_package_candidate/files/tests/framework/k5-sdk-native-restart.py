#!/usr/bin/python3
"""Extend the unchanged CFT launcher's lifetime with one same-profile restart.

The local guard owns every Popen handle, including constructors which fail after
spawn. It also guards the skill launcher's rmtree: only the original directory
inode may be removed, and only after all owned children are confirmed exited.
Process cleanup deliberately does not depend on profile existence or permissions.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import select
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

GLOBAL_LAUNCHER = Path('/Users/shopme/.codex/browser-testing/launch.py')
IMPLEMENTATION = Path('/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py')
NATIVE_POPEN = subprocess.Popen
NATIVE_RMTREE = shutil.rmtree
NATIVE_MKDTEMP = tempfile.mkdtemp


def inspect_process(child, arguments):
    def ps(columns):
        with NATIVE_POPEN(['/bin/ps', '-p', str(child.pid), '-o', columns],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as inspector:
            output, error = inspector.communicate(timeout=5)
            if inspector.returncode != 0:
                raise RuntimeError('process-inspection-unavailable: ' + error.strip())
        return output.strip()
    identity = ps('pid=,ppid=,comm=').split(None, 2)
    command = ps('command=')
    if len(identity) != 3 or int(identity[0]) != child.pid or int(identity[1]) != os.getpid() or identity[2] != arguments[0]:
        raise RuntimeError('Owned child PID/PPID/executable mismatch')
    for switch in [arg for arg in arguments if arg.startswith('--user-data-dir=')] + ['--use-mock-keychain']:
        if not re.search(r'(?<!\S)' + re.escape(switch) + r'(?!\S)', command):
            raise RuntimeError('Owned child arguments mismatch')
    if re.search(r'(?<!\S)--type(?:=|\s|$)', command):
        raise RuntimeError('Expected Chrome main process, not subprocess')
    return dict(pid=child.pid, ppid=int(identity[1]), executable=identity[2], command=command)


class Lifecycle:
    def __init__(self, report, popen=NATIVE_POPEN, inspect=inspect_process,
                 implementation_hash=None, remove=NATIVE_RMTREE, output=None):
        self.report = Path(report)
        self.lifecycle = self.report.with_suffix('.lifecycle.jsonl')
        self.cleanup_report = self.report.with_suffix('.cleanup.json')
        self.popen, self.inspect, self.remove = popen, inspect, remove
        self.implementation_hash = implementation_hash or (lambda: hashlib.sha256(IMPLEMENTATION.read_bytes()).hexdigest())
        self.output = output or (lambda value: print(json.dumps(value), flush=True))
        self.children, self.errors, self.events = [], [], []
        self.profile = None
        self.profile_identity = None
        self.profile_status = 'not-created'
        self.attempts = 0

    def error(self, error, stage, kind='cleanup'):
        entry = dict(kind=kind, stage=stage, type=type(error).__name__, message=str(error))
        self.errors.append(entry)
        return entry

    def publish(self, value):
        try:
            self.output(value)
        except Exception as error:
            self.error(error, 'stdout-evidence')

    def register_profile(self, profile):
        self.profile = Path(profile)
        info = self.profile.lstat()
        if not stat.S_ISDIR(info.st_mode) or not self.profile.is_absolute():
            raise ValueError('Expected launcher-created absolute directory')
        self.profile_identity = (info.st_dev, info.st_ino)
        self.profile_status = 'owned'

    def register_child(self, owner):
        # Registration happens immediately after Popen, before any hash/log,
        # process inspection or public metadata operation can throw.
        self.children.append(owner)
        self.publish(dict(event='owned-child', pid=owner.pid, generation=owner.generation,
                          launcherPid=os.getpid(), profile=str(owner.profile), args=owner.arguments))

    def event(self, owner, event, **values):
        entry = dict(event=event, at=time.time(), generation=owner.generation, pid=owner.pid,
                     launcherPid=os.getpid(), profile=str(owner.profile),
                     profileDevice=self.profile_identity[0], profileInode=self.profile_identity[1], **values)
        self.events.append(entry)
        with self.lifecycle.open('a') as stream:
            stream.write(json.dumps(entry) + '\n')

    def process_state(self, owner):
        try:
            code = owner.child.poll()  # waitpid on our actual Popen, not ps inference
            if code is not None:
                return dict(pid=owner.pid, state='exited', returncode=code)
            identity = self.inspect(owner.child, owner.arguments)
            return dict(pid=owner.pid, state='owned-live', identity=identity)
        except Exception as error:
            self.error(error, 'inspect-child')
            return dict(pid=owner.pid, state='unknown', error=str(error))

    def cleanup_child(self, owner):
        state = self.process_state(owner)
        if state['state'] != 'owned-live':
            return state
        try:
            owner.child.terminate()
            try:
                owner.child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                # Revalidate at the instant of escalation. Profile state has
                # no bearing on proving this exact child still belongs to us.
                state = self.process_state(owner)
                if state['state'] == 'owned-live':
                    owner.child.kill()
                    owner.child.wait(timeout=10)
                elif state['state'] != 'exited':
                    return state
        except Exception as error:
            self.error(error, 'terminate-wait-kill')
        return self.process_state(owner)

    def cleanup_children(self):
        self.attempts += 1
        return [self.cleanup_child(owner) for owner in self.children]

    def guarded_remove(self, profile, *args, **kwargs):
        if self.profile is None or Path(profile) != self.profile:
            raise RuntimeError('Refuse deleting an unregistered profile')
        states = self.cleanup_children()
        if any(row['state'] != 'exited' for row in states):
            self.profile_status = 'retained-child-not-exited'
            raise RuntimeError('Refuse profile deletion while child state is live/unknown')
        try:
            info = self.profile.lstat()
        except FileNotFoundError:
            if self.profile_status != 'removed':
                self.profile_status = 'path-absent'
            return
        if not stat.S_ISDIR(info.st_mode) or (info.st_dev, info.st_ino) != self.profile_identity:
            self.profile_status = 'retained-replaced-path'
            raise RuntimeError('Refuse deleting replaced profile inode or symlink')
        # Ignore the skill's ignore_errors=True: deletion failure must be visible.
        self.remove(self.profile, ignore_errors=False)
        self.profile_status = 'removed'

    def finalize(self):
        states = self.cleanup_children()
        if self.profile is not None:
            try:
                self.guarded_remove(self.profile)
            except Exception as error:
                self.error(error, 'guarded-profile-removal')
        result = dict(event='adapter-cleanup', launcherPid=os.getpid(),
                      status='PASS' if all(row['state'] == 'exited' for row in states) and
                      self.profile_status in ('removed', 'path-absent', 'not-created') and not self.errors else 'FAIL',
                      profile=str(self.profile) if self.profile else None, profileIdentity=self.profile_identity,
                      profileStatus=self.profile_status, children=states,
                      residual=[row for row in states if row['state'] != 'exited'], errors=self.errors,
                      events=self.events, attempts=self.attempts)
        if self.profile_status.startswith('retained'):
            result['residual'].append(dict(profile=str(self.profile), state=self.profile_status))
        try:
            self.cleanup_report.write_text(json.dumps(result, indent=2) + '\n')
        except Exception as error:
            self.error(error, 'cleanup-report-write')
            result['status'] = 'FAIL'
        self.publish(result)  # Independent fallback even when file/log I/O fails.
        return result


class RestartableChild:
    def __init__(self, arguments, manager, **options):
        self.arguments, self.options, self.manager = list(arguments), options, manager
        profiles = [arg.split('=', 1)[1] for arg in arguments if arg.startswith('--user-data-dir=')]
        if len(profiles) != 1 or '--use-mock-keychain' not in arguments:
            raise ValueError('Only launcher-owned mock-keychain Chrome can restart')
        self.profile = Path(profiles[0])  # Preserve /var vs /private/var argv spelling.
        if manager.profile != self.profile:
            raise ValueError('Expected the global launcher-created profile')
        self.assert_profile()
        self.generation, self.stopping, self.restarted = 1, False, False
        # All precomputable fallible work precedes spawn (R1 hash/read failure).
        implementation_hash = manager.implementation_hash()
        self.child = manager.popen(self.arguments, **options)
        try:
            manager.register_child(self)
            manager.event(self, 'started', implementation=str(IMPLEMENTATION), implementationSha256=implementation_hash)
        except Exception as error:
            manager.error(error, 'constructor-started-event', 'original')
            if self not in manager.children:
                manager.children.append(self)
            manager.cleanup_child(self)
            raise

    @property
    def pid(self):
        return self.child.pid

    def poll(self):
        return self.child.poll()

    def assert_profile(self):
        info = self.profile.lstat()
        if not stat.S_ISDIR(info.st_mode) or (info.st_dev, info.st_ino) != self.manager.profile_identity or info.st_mode & 0o777 != 0o700:
            raise ValueError('Launcher profile identity/permissions changed')

    def assert_process(self):
        state = self.manager.process_state(self)
        if state['state'] == 'unknown':
            raise RuntimeError('process-inspection-unavailable or ownership mismatch')
        return state

    def send_signal(self, signum):
        if self.assert_process()['state'] == 'owned-live':
            self.child.send_signal(signum)
        self.stopping = True

    def terminate(self):
        self.send_signal(signal.SIGTERM)

    def kill(self):
        self.send_signal(signal.SIGKILL)

    def restart(self):
        if self.restarted:
            raise ValueError('Only one same-run restart is permitted')
        self.assert_profile()
        self.assert_process()
        code = self.child.wait(timeout=20)
        if code != 0:
            raise ValueError('Browser.close must exit cleanly before restart: ' + str(code))
        self.manager.event(self, 'browser-exited', returncode=code, reason='native Browser.close')
        old_pid = self.pid
        self.assert_profile()
        (self.profile / 'DevToolsActivePort').unlink(missing_ok=True)
        # Prepare the retired owner before spawning anything new.
        old_owner = object.__new__(RestartableChild)
        old_owner.__dict__ = self.__dict__.copy()
        new_child = self.manager.popen(self.arguments, **self.options)
        # Keep the previous handle and register the new one before validation or
        # metadata writes. Even a failed metadata publication cannot orphan it.
        previous = self.manager.children[-1]
        self.manager.children[self.manager.children.index(previous)] = old_owner
        self.child = new_child
        self.generation, self.restarted = 2, True
        try:
            self.manager.register_child(self)
            self.assert_process()
            self.assert_profile()
            self.manager.event(self, 'restarted', previousPid=old_pid, previousExitCode=code, arguments=self.arguments)
            metadata = dict(pid=self.pid, profile=str(self.profile), executable=self.arguments[0],
                            args=self.arguments, log=str(self.profile / 'chrome.log'),
                            previousPid=old_pid, generation=2, sameProfile=True)
            temporary_report = self.manager.report.with_suffix('.next.json')
            temporary_report.write_text(json.dumps(metadata, indent=2) + '\n')
            temporary_report.replace(self.manager.report)
        except Exception as error:
            self.manager.error(error, 'restart-publication', 'original')
            self.manager.cleanup_child(self)
            raise

    def wait(self, timeout=None):
        if timeout is not None:
            return self.child.wait(timeout=timeout)
        try:
            while True:
                if self.stopping:
                    code = self.child.wait(timeout=20)
                    self.manager.event(self, 'browser-exited', returncode=code, reason='launcher stop')
                    return code
                if select.select([sys.stdin], [], [], 0.1)[0]:
                    command = sys.stdin.readline()
                    if not command:
                        self.terminate()
                        continue
                    if json.loads(command) != {'action': 'restart'}:
                        raise ValueError('Unknown restart command')
                    self.restart()
        except Exception as error:
            self.manager.error(error, 'lifetime-wait', 'original')
            self.manager.cleanup_child(self)
            raise


def main():
    if len(sys.argv) < 2 or Path(sys.argv[1]) != GLOBAL_LAUNCHER:
        raise ValueError('Pin the controlled global launcher')
    sys.argv = [str(GLOBAL_LAUNCHER), *sys.argv[2:]]
    # resolve-only has no profile or child lifecycle to adapt.
    if '--resolve-only' in sys.argv:
        os.execv('/usr/bin/python3', sys.argv)
    manager = Lifecycle(sys.argv[sys.argv.index('--report') + 1])
    original_execv = os.execv

    def fresh_profile(*args, **kwargs):
        profile = NATIVE_MKDTEMP(*args, **kwargs)
        manager.register_profile(profile)
        return profile

    def follow_global_entry(executable, arguments):
        if executable != '/usr/bin/python3' or arguments != [executable, str(IMPLEMENTATION), *sys.argv[1:]]:
            raise ValueError('Global launcher implementation changed; review before running')
        sys.argv[0] = str(IMPLEMENTATION)
        runpy.run_path(str(IMPLEMENTATION), run_name='__main__')

    successful_exit = False
    try:
        os.execv = follow_global_entry
        subprocess.Popen = lambda arguments, **options: RestartableChild(arguments, manager, **options)
        tempfile.mkdtemp = fresh_profile
        shutil.rmtree = manager.guarded_remove
        try:
            runpy.run_path(str(GLOBAL_LAUNCHER), run_name='__main__')
        except SystemExit as error:
            successful_exit = error.code in (None, 0)
            if not successful_exit:
                raise
        except BaseException as error:
            manager.error(error, 'global-launcher', 'original')
            raise
    finally:
        # Runs even if the skill's child assignment/finally itself threw.
        result = manager.finalize()
        os.execv, subprocess.Popen = original_execv, NATIVE_POPEN
        tempfile.mkdtemp, shutil.rmtree = NATIVE_MKDTEMP, NATIVE_RMTREE
    if successful_exit and result['status'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
