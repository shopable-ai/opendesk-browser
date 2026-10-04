#!/usr/bin/python3
"""Extend the unchanged CFT launcher's lifetime with one same-profile restart.

The local guard owns every Popen handle, including constructors which fail after
spawn. It also guards the skill launcher's rmtree: only the original 0700
directory inode may be removed, and only after all owned children are confirmed exited.
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
        if info.st_mode & 0o777 != 0o700:
            self.profile_status = 'retained-mode-changed'
            raise RuntimeError('Refuse deleting profile after permission change')
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


def _selftest():
    class FakeChild:
        next_pid = 1000

        def __init__(self, wait_code=0):
            FakeChild.next_pid += 1
            self.pid = FakeChild.next_pid
            self.alive = True
            self.returncode = None
            self.terminated = 0
            self.killed = 0
            self.wait_code = wait_code

        def poll(self):
            return None if self.alive else self.returncode

        def terminate(self):
            self.terminated += 1
            self.alive = False
            self.returncode = self.wait_code

        def kill(self):
            self.killed += 1
            self.alive = False
            self.returncode = -9

        def wait(self, timeout=None):
            self.alive = False
            self.returncode = self.wait_code
            return self.returncode

        def send_signal(self, signum):
            self.terminate()

    def with_profile(operation):
        with tempfile.TemporaryDirectory(prefix='k5-restart-selftest-') as root:
            profile = Path(root) / 'codex-cft-owned'
            profile.mkdir(mode=0o700)
            profile.chmod(0o700)
            report = Path(root) / 'launcher.json'
            manager = Lifecycle(report, inspect=lambda child, args: dict(pid=child.pid, ppid=os.getpid()),
                                output=lambda value: None, implementation_hash=lambda: 'hash')
            manager.register_profile(profile)
            return operation(root, profile, manager)

    def make_owner(manager, child=None):
        owner = object.__new__(RestartableChild)
        owner.arguments = ['/pinned/CFT', '--use-mock-keychain', f'--user-data-dir={manager.profile}']
        owner.options = {}
        owner.manager = manager
        owner.profile = manager.profile
        owner.generation = 1
        owner.stopping = False
        owner.restarted = False
        owner.child = child or FakeChild()
        manager.children.append(owner)
        return owner

    passed = []

    def check(name, operation):
        operation()
        passed.append(name)
        print('PASS ' + name)

    def constructor_hash_failure_does_not_spawn():
        spawned = []

        def run(root, profile, manager):
            manager.implementation_hash = lambda: (_ for _ in ()).throw(OSError('hash failure'))
            manager.popen = lambda *args, **kwargs: spawned.append(args) or FakeChild()
            try:
                RestartableChild(['/pinned/CFT', '--use-mock-keychain', f'--user-data-dir={profile}'], manager)
            except OSError as error:
                assert str(error) == 'hash failure'
            else:
                raise AssertionError('hash fault should fail construction')
            assert spawned == []
            assert manager.children == []

        with_profile(run)

    def constructor_event_failure_cleans_spawned_child():
        def run(root, profile, manager):
            child = FakeChild()
            manager.popen = lambda *args, **kwargs: child
            manager.event = lambda *args, **kwargs: (_ for _ in ()).throw(OSError('lifecycle write failure'))
            try:
                RestartableChild(['/pinned/CFT', '--use-mock-keychain', f'--user-data-dir={profile}'], manager)
            except OSError as error:
                assert str(error) == 'lifecycle write failure'
            else:
                raise AssertionError('event fault should fail construction')
            assert child.alive is False
            assert child.terminated == 1
            assert [owner.pid for owner in manager.children] == [child.pid]
            assert manager.errors[-1]['stage'] == 'constructor-started-event'

        with_profile(run)

    def replaced_profile_retained_after_owned_child_cleanup():
        def run(root, profile, manager):
            child = FakeChild()
            make_owner(manager, child)
            original_identity = manager.profile_identity
            shutil.rmtree(profile)
            profile.mkdir(mode=0o700)
            profile.chmod(0o700)
            assert (profile.lstat().st_dev, profile.lstat().st_ino) != original_identity
            try:
                manager.guarded_remove(profile)
            except RuntimeError as error:
                assert 'replaced profile' in str(error)
            else:
                raise AssertionError('replacement profile should be retained')
            assert child.alive is False
            assert profile.exists()
            assert manager.profile_status == 'retained-replaced-path'

        with_profile(run)

    def missing_profile_does_not_block_owned_child_cleanup():
        def run(root, profile, manager):
            child = FakeChild()
            make_owner(manager, child)
            shutil.rmtree(profile)
            manager.guarded_remove(profile)
            assert child.alive is False
            assert manager.profile_status == 'path-absent'

        with_profile(run)

    def mode_change_blocks_profile_delete_after_child_cleanup():
        def run(root, profile, manager):
            child = FakeChild()
            make_owner(manager, child)
            profile.chmod(0o755)
            try:
                manager.guarded_remove(profile)
            except RuntimeError as error:
                assert 'permission change' in str(error)
            else:
                raise AssertionError('mode-changed profile should be retained')
            assert child.alive is False
            assert profile.exists()
            assert manager.profile_status == 'retained-mode-changed'

        with_profile(run)

    def ps_unavailable_is_unknown_not_exit():
        def run(root, profile, manager):
            child = FakeChild()
            owner = make_owner(manager, child)
            manager.inspect = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError('ps unavailable'))
            state = manager.cleanup_child(owner)
            assert state['state'] == 'unknown'
            assert child.alive is True
            try:
                manager.guarded_remove(profile)
            except RuntimeError as error:
                assert 'live/unknown' in str(error)
            else:
                raise AssertionError('unknown child state should retain profile')
            assert manager.profile_status == 'retained-child-not-exited'
            assert profile.exists()

        with_profile(run)

    def restart_event_failure_retains_and_cleans_new_pid():
        def run(root, profile, manager):
            children = [FakeChild(), FakeChild()]
            manager.popen = lambda *args, **kwargs: children.pop(0)
            first = RestartableChild(['/pinned/CFT', '--use-mock-keychain', f'--user-data-dir={profile}'], manager)
            first.child.wait_code = 0
            started_event = manager.event

            def event(owner, event, **values):
                if event == 'restarted':
                    raise OSError('restart metadata failure')
                return started_event(owner, event, **values)

            manager.event = event
            try:
                first.restart()
            except OSError as error:
                assert str(error) == 'restart metadata failure'
            else:
                raise AssertionError('restart event fault should fail restart')
            pids = [owner.pid for owner in manager.children]
            assert first.pid in pids
            assert first.child.alive is False
            assert manager.errors[-1]['stage'] == 'restart-publication'

        with_profile(run)

    def finalize_writes_missing_lifecycle_style_report():
        def run(root, profile, manager):
            child = FakeChild()
            make_owner(manager, child)
            shutil.rmtree(profile)
            result = manager.finalize()
            assert result['status'] == 'PASS'
            assert result['profileStatus'] == 'path-absent'
            assert manager.cleanup_report.exists()
            assert json.loads(manager.cleanup_report.read_text())['profileStatus'] == 'path-absent'

        with_profile(run)

    check('hash failure before spawn does not leak child', constructor_hash_failure_does_not_spawn)
    check('spawned child is cleaned when lifecycle write fails', constructor_event_failure_cleans_spawned_child)
    check('replacement profile is retained after owned child cleanup', replaced_profile_retained_after_owned_child_cleanup)
    check('missing profile does not block owned child cleanup', missing_profile_does_not_block_owned_child_cleanup)
    check('mode change cleans owned child but retains profile', mode_change_blocks_profile_delete_after_child_cleanup)
    check('ps unavailable leaves child unknown and retained', ps_unavailable_is_unknown_not_exit)
    check('restart metadata failure retains and cleans next generation pid', restart_event_failure_retains_and_cleans_new_pid)
    check('finalize writes cleanup report for absent lifecycle/profile', finalize_writes_missing_lifecycle_style_report)
    print(json.dumps(dict(selftest='restart-adapter', passed=len(passed), browserStarted=False)))


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        _selftest()
    else:
        main()
