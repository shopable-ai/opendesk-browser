"""Trusted SSH maintenance only; no public route, task execution or DB access."""
import fcntl
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import uuid

CONFIG_DIRECTORY = Path('/Users/a0000/Documents/workspace-old/todo-admin-midway-cool8-operate/work/upgrade-v8-operate-stage1/private')


def update_binding(directory, request):
    directory = Path(directory)
    assert directory.is_absolute() and directory.resolve() == directory, 'CONFIG_DIRECTORY'
    assert directory.stat().st_uid == os.getuid() and not directory.stat().st_mode & 0o022, 'CONFIG_DIRECTORY'
    lock = os.open(directory / '.opendesk-cloud-demo.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        lock_stat = os.fstat(lock)
        assert stat.S_ISREG(lock_stat.st_mode) and lock_stat.st_uid == os.getuid() and lock_stat.st_nlink == 1, 'CONFIG_LOCK'
        assert stat.S_IMODE(lock_stat.st_mode) == 0o600, 'CONFIG_LOCK'
        fcntl.flock(lock, fcntl.LOCK_EX)
        config_file = directory / 'opendesk-cloud-demo.json'
        fd = os.open(config_file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            observed = os.fstat(stream.fileno())
            assert stat.S_ISREG(observed.st_mode) and observed.st_uid == os.getuid() and observed.st_nlink == 1, 'CONFIG_FILE'
            assert stat.S_IMODE(observed.st_mode) == 0o600 and 0 < observed.st_size <= 65536, 'CONFIG_FILE'
            original = stream.read(65537)
        assert len(original) <= 65536, 'CONFIG_FILE'
        config = json.loads(original)
        assert config['providerId'] == '9c4f182d-7a5f-403d-9b4d-c2144ef35e5b', 'PROVIDER_ID'
        assert config['providerUrl'] == 'https://127.0.0.1:43113/', 'PROVIDER_URL'
        pin = request['taskPin']
        assert set(pin) == {'taskId', 'version', 'manifestHash', 'sourceHash'}, 'FIXED_PIN'
        approved = {
            '1.0.0': ('57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a', '1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63'),
            '1.0.1': ('8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7', '9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153'),
        }
        assert pin['taskId'] == 'sample.form-fill' and approved.get(pin['version']) == (pin['manifestHash'], pin['sourceHash']), 'FIXED_PIN'
        existing = [b for b in config['bindings'] if b['deviceId'] == request['deviceId']]
        expected = request.get('expectedBindingId')
        if expected is None:
            assert not existing, 'DEVICE_ALREADY_BOUND'
        else:
            assert len(existing) == 1 and existing[0]['bindingId'] == expected and existing[0]['userId'] == request['userId'], 'BINDING_CHANGED'
        other = [b for b in config['bindings'] if b['deviceId'] != request['deviceId']]
        current_pin = config.get('taskPin')
        current_version = current_pin['version'] if current_pin else '1.0.0'
        # One selected Task per demo config. Never change another device's pin.
        assert not other or current_pin == pin or (current_pin is None and pin['version'] == current_version), 'OTHER_DEVICE_PIN_CONFLICT'
        if request.get('checkOnly'):
            return {'checked': True}
        binding = request['binding']
        assert set(binding) == {'bindingId', 'deviceId', 'userId', 'executorId', 'clientId', 'grantId', 'clientToken'}, 'BINDING_SCHEMA'
        assert binding['deviceId'] == request['deviceId'] and binding['userId'] == request['userId'], 'BINDING_IDENTITY'
        assert not any(b['bindingId'] == binding['bindingId'] or b['clientId'] == binding['clientId'] for b in config['bindings']), 'FRESH_BINDING_REQUIRED'
        if existing and current_version != pin['version']:
            assert existing[0]['grantId'] != binding['grantId'], 'FRESH_VERSION_GRANT_REQUIRED'
        config['bindings'] = other + [binding]
        config['taskPin'] = pin
        encoded = (json.dumps(config, indent=2) + '\n').encode()
        assert len(encoded) <= 65536, 'CONFIG_LIMIT'
        if existing:
            backup = directory / ('cloud-demo-binding-before-' + str(uuid.uuid4()) + '.json')
            backup_fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(backup_fd, 'wb') as stream:
                stream.write(original)
                stream.flush()
                os.fsync(stream.fileno())
        tmp_fd, tmp = tempfile.mkstemp(dir=directory, prefix='cloud-demo-')
        try:
            os.fchmod(tmp_fd, 0o600)
            with os.fdopen(tmp_fd, 'wb') as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, config_file)
            dir_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return {'bound': True, 'replaced': bool(existing)}
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        print(json.dumps(update_binding(CONFIG_DIRECTORY, json.load(sys.stdin))))
    except Exception:
        # Do not expose config, credentials, Python locals or remote file paths.
        print('SERVER_BIND_FAILED_OR_REQUIRES_RECONCILIATION', file=sys.stderr)
        sys.exit(1)
