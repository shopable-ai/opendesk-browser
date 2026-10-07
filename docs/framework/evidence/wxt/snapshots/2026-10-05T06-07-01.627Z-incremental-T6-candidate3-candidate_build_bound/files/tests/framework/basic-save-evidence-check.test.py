"""Checker regression tests over copies of real raw evidence; not product runs."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
FILE = ROOT / 'tests/framework/check-basic-save-evidence-20261003.py'
SPEC = importlib.util.spec_from_file_location('basic_save_check', FILE)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)
EVIDENCE = ROOT / 'docs/framework/evidence/f2-controller-product-native/native-2026-10-03T09-28-25.557Z-b00dcdb8'


class EvidenceChecks(unittest.TestCase):
    def setUp(self):
        session = EVIDENCE / 'production-138'
        self.report = json.loads((session / 'report.json').read_text())
        self.inputs = [json.loads(line) for line in (session / 'ui-input.jsonl').read_text().splitlines()]
        self.revision = json.loads(next(session.glob('revision-*-r1.json')).read_text())
        self.raw = [json.loads(line) for line in (EVIDENCE / 'raw-cdp.jsonl').read_text().splitlines()]
        self.permission = json.loads((session / 'native-permission-state.json').read_text())

    def inspect(self):
        return CHECK.inspect_transcript(self.report, self.inputs, self.revision, self.raw, self.permission)

    def snapshot(self):
        for row in self.raw:
            value = row['message'].get('result', {}).get('result', {}).get('value')
            if row['endpoint'].startswith('production-138-') and isinstance(value, dict) and 'rows' in value:
                return value
        self.fail('Real IDB response is missing')

    def test_real_saved_prefix_does_not_pass_blocked_parent_or_f3(self):
        observed = self.inspect()
        self.assertTrue(observed['savePrefixVerified'])
        self.assertEqual(observed['originalCaseStatus'], 'BLOCKED')
        self.assertFalse(observed['originalCasePassed'])
        self.assertFalse(observed['f3Accepted'])
        self.assertIn('runtime params binding', observed['notProved'])

    def test_source_tamper_cannot_reuse_native_revision_hash(self):
        self.revision['sourceUtf8'] += ' '
        with self.assertRaisesRegex(ValueError, 'revision/source SHA256'):
            self.inspect()

    def test_revision_file_without_matching_raw_idb_cannot_prove_save(self):
        self.snapshot()['rows']['scriptRevisions'] = []
        with self.assertRaisesRegex(ValueError, 'read-only committed-r1 snapshot'):
            self.inspect()

    def test_same_script_id_in_wrong_namespace_cannot_supply_committed_head(self):
        self.snapshot()['rows']['scriptHeads'][0]['value']['namespace'] = 'page:https://example.invalid'
        with self.assertRaisesRegex(ValueError, 'Committed head'):
            self.inspect()

    def test_partial_native_selection_cannot_claim_replacement(self):
        self.inputs[0]['selected']['start'] = 1
        with self.assertRaisesRegex(ValueError, 'selection did not replace'):
            self.inspect()

    def test_claimed_ui_echo_requires_actual_raw_response(self):
        for row in self.raw:
            value = row['message'].get('result', {}).get('result', {}).get('value')
            if value == self.revision['scriptId']:
                row['message']['result']['result']['value'] = 'my-script' + value
        with self.assertRaisesRegex(ValueError, 'Raw UI input echo'):
            self.inspect()

    def test_idb_row_without_native_save_click_cannot_prove_workbench_save(self):
        self.raw = [row for row in self.raw if not (
            row['endpoint'].startswith('production-138-') and
            row['message'].get('method') == 'Input.dispatchMouseEvent' and
            row['message'].get('params', {}).get('type') == 'mouseReleased')]
        with self.assertRaisesRegex(ValueError, 'native save-button mouseReleased'):
            self.inspect()

    def test_saved_ui_identity_must_match_committed_revision(self):
        for row in self.raw:
            value = row['message'].get('result', {}).get('result', {}).get('value')
            if isinstance(value, dict) and value.get('state') == 'saved':
                identity = json.loads(value['result'])
                identity['contentHash'] = '0' * 64
                value['result'] = json.dumps(identity)
        with self.assertRaisesRegex(ValueError, 'Saved UI identity'):
            self.inspect()

    def test_actual_chrome154_launcher_drift_is_rejected(self):
        drifted = json.loads((EVIDENCE / 'production-154/report.json').read_text())
        self.assertTrue(drifted['launcherDrift'])
        self.report = copy.deepcopy(drifted)
        with self.assertRaisesRegex(ValueError, 'Native run inputs drifted'):
            self.inspect()

    def test_repeating_chrome138_cannot_replace_required_chrome154(self):
        with self.assertRaisesRegex(ValueError, 'Both supported production environments'):
            CHECK.verify(EVIDENCE, self.report['packageHash'], ['138', '138'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
