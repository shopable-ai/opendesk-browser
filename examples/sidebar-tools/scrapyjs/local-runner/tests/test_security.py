import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scrapyjs_runner.security import load_credential, target_url, pinned_addresses
from scrapyjs_runner.errors import Fault

class SecurityTests(unittest.TestCase):
    def test_private_dns_mixed_answers_and_unapproved_loopback_denied(self):
        for addr in ['127.0.0.1','169.254.169.254','10.0.0.1','::1','::ffff:127.0.0.1','224.0.0.1','ff02::1']:
            with self.subTest(addr=addr), self.assertRaises(Fault):
                pinned_addresses('http://['+addr+']/' if ':' in addr else 'http://'+addr+'/',set())
        # DNS boundary only is replaced; real URL/IP policy is exercised.
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('93.184.216.34',80)),(2,1,6,'',('127.0.0.1',80))]):
            with self.assertRaises(Fault): pinned_addresses('http://example.org/',set())
    def test_scope_and_url_credentials_cannot_escape(self):
        for value in ['https://user:pass@example.org/','file:///etc/passwd','https://example.org@127.0.0.1/','https://example.org:444/']:
            with self.subTest(value=value), self.assertRaises(Fault): target_url(value,'https://example.org')
        self.assertEqual(target_url('https://example.org/list','https://example.org').hostname,'example.org')
    def test_master_file_requires_json_endpoint_and_owner_only_permissions(self):
        base=Path('.test-data'); base.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            path=Path(tmp)/'master.json'
            value={'format':'opendesk.local-task-credential.v1','secret':'x'*40,'endpoint':'http://127.0.0.1:43231'}
            path.write_text(json.dumps(value)); path.chmod(0o600)
            self.assertEqual(load_credential(path,43231),'x'*40)
            with self.assertRaises(Fault): load_credential(path,43232)
            for secret in ['x'*31,'x'*129,'x'*32+'=','x'*32+'+','x'*32+'/']:
                value['secret']=secret; path.write_text(json.dumps(value))
                with self.assertRaises(Fault): load_credential(path,43231)
            value['secret']='x'*40; path.write_text(json.dumps(value))
            path.chmod(0o644)
            with self.assertRaises(Fault): load_credential(path,43231)
            path.chmod(0o600)
            link=Path(tmp)/'link'; link.symlink_to(path.absolute())
            with self.assertRaises(Fault): load_credential(link,43231)

class CredentialInitTests(unittest.TestCase):
    def test_explicit_init_atomically_creates_private_json_and_never_overwrites(self):
        from scrapyjs_runner.security import init_credential
        import re
        base=Path('.test-data'); base.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            path=Path(tmp)/'private'/'credential.json'
            init_credential(path,43231)
            raw=path.read_bytes(); value=json.loads(raw)
            self.assertEqual(value['format'],'opendesk.local-task-credential.v1')
            self.assertEqual(value['endpoint'],'http://127.0.0.1:43231')
            self.assertTrue(re.fullmatch(r'[A-Za-z0-9_-]{64}',value['secret']) is not None,'Generated secret format invalid')
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777,0o700)
            init_credential(path,43231)
            self.assertTrue(path.read_bytes()==raw,'Existing credential must not change')
            with self.assertRaises(Fault): init_credential(path,43232)
            self.assertTrue(path.read_bytes()==raw,'Existing credential must not change')
            self.assertEqual(sorted(p.name for p in path.parent.iterdir()),['credential.json'])
    def test_init_refuses_public_directory_symlinks_and_invalid_existing_secret(self):
        from scrapyjs_runner.security import init_credential
        base=Path('.test-data'); base.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            parent=Path(tmp)/'public'; parent.mkdir(mode=0o755); parent.chmod(0o755)
            with self.assertRaises(Fault): init_credential(parent/'master.json',43231)
            self.assertEqual(list(parent.iterdir()),[])
            parent.chmod(0o700)
            path=parent/'master.json'; path.write_text('invalid'); path.chmod(0o600)
            with self.assertRaises(Fault): init_credential(path,43231)
            self.assertEqual(path.read_text(),'invalid')
