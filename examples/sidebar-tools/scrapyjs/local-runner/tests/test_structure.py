"""Structure uses the original authenticated service and real bounded downloader."""
import hashlib
import json
import time
import unittest
import tempfile
import threading
from http.server import ThreadingHTTPServer
import test_service as service_harness


class StructureServiceTests(unittest.TestCase):
    start_service=classmethod(service_harness.ServiceTests.start_service.__func__)
    call=classmethod(service_harness.ServiceTests.call.__func__)
    session=classmethod(service_harness.ServiceTests.session.__func__)
    config=service_harness.ServiceTests.config
    start=service_harness.ServiceTests.start
    @classmethod
    def setUpClass(cls):
        service_harness.ServiceTests.setUpClass.__func__(cls)
        cls.fixture.source_pages = {}

    @classmethod
    def tearDownClass(cls):
        # Do not overwrite the historical collection service-proof.json.
        if cls.proc.poll() is None:
            cls.proc.terminate(); cls.proc.wait(timeout=10)
        cls.log.close()
        cls.fixture.release.set(); cls.fixture.shutdown(); cls.fixture.server_close()
        cls.tmp.cleanup()

    def structure_config(self, path='/page/1'):
        return {'url':self.scope+path, 'inputHash':'sha256:'+'a'*64,
                'maxPages':20, 'previewPages':3}

    def finish_structure(self, config=None):
        body, snap = self.start(config or self.structure_config(), mode='structure')
        deadline=time.monotonic()+10
        while not snap['workerExited'] and time.monotonic()<deadline:
            time.sleep(.05)
            status,snap=self.call('/v1/runs/'+snap['runId'])
            self.assertEqual(status,200)
        self.assertTrue(snap['workerExited'],snap)
        return body,snap

    def test_structure_source_binding_and_collection_separation(self):
        body,snap=self.finish_structure()
        self.assertEqual(snap['status'],'COMPLETED',snap)
        self.assertEqual(snap['pagesVisited'],1)
        self.assertFalse(snap['previewPassed'])
        status,rows=self.call('/v1/runs/'+snap['runId']+'/records?offset=0&limit=1')
        self.assertEqual(status,200); self.assertEqual(rows['total'],1)
        record=rows['records'][0]
        source=self.fixture.source_pages['/page/1'].encode()
        self.assertEqual(record['sourceHash'],'sha256:'+hashlib.sha256(source).hexdigest())
        self.assertEqual(record['inputHash'],body['config']['inputHash'])
        self.assertEqual(record['url'],body['config']['url'])
        self.assertIn('第1页',record['sample']); self.assertIn('id="rows"',record['sample'])
        self.assertLessEqual(len(record['sample'].encode()),8000)
        self.assertLessEqual(len(json.dumps(record,ensure_ascii=False).encode()),16384)
        status,repeated=self.call('/v1/runs','POST',body)
        self.assertEqual(status,200); self.assertEqual(repeated['runId'],snap['runId'])
        status,other=self.call('/v1/runs/'+snap['runId'],token=self.session('different-owner'))
        self.assertEqual(status,404)
        cfg=self.config()
        status,rejected=self.call('/v1/runs','POST',{'requestId':'structure-cannot-certify-full',
            'mode':'full','config':cfg,'previewRunId':snap['runId'],'configHash':snap['configHash']})
        self.assertEqual(status,409); self.assertIn(rejected['error']['code'],['PREVIEW_REQUIRED','PREVIEW_MISMATCH'])

    def test_structure_preserves_robots_redirect_and_private_address_guards(self):
        for path,code in [('/denied','ROBOTS_DENIED'),('/redirect','SCOPE_MISMATCH'),('/large','RESPONSE_TOO_LARGE')]:
            _,snap=self.finish_structure(self.structure_config(path))
            self.assertEqual(snap['status'],'FAILED',snap)
            self.assertEqual(snap['recordsCount'],0)
            self.assertEqual(snap['errors'][0]['code'],code)
        self.assertNotIn('/denied',self.fixture.hits)

    def test_structure_stop_and_revocation_wait_for_original_worker(self):
        _,snap=self.start(self.structure_config('/slow/2'),mode='structure')
        status,stopped=self.call('/v1/runs/'+snap['runId']+'/stop','POST',{})
        self.assertEqual(status,200); self.assertTrue(stopped['workerExited'])
        self.assertEqual(stopped['status'],'STOPPED'); self.assertFalse(stopped['previewPassed'])
        token=self.session('structure-revoke-owner')
        body={'requestId':'structure-revoke-request','mode':'structure','config':self.structure_config('/slow/2')}
        status,snap=self.call('/v1/runs','POST',body,token=token)
        self.assertEqual(status,202)
        status,revoked=self.call('/v1/revoke','POST',{'owner':'structure-revoke-owner'},token=self.secret,origin=None)
        self.assertEqual(status,200); self.assertTrue(revoked['workerExited'])
        self.assertEqual(self.call('/v1/runs/'+snap['runId'],token=token)[0],401)
        self.assertEqual(self.call('/v1/runs/'+stopped['runId'])[0],200,'other owner remains authorized')


class StructureModelTests(unittest.TestCase):
    def test_omitted_link_cannot_certify_an_empty_structure(self):
        from scrapyjs_runner.structure import structure_record
        from scrapyjs_runner.errors import Fault
        attributes=' '.join(name+'="'+'&'*256+'"' for name in
                            ['id','class','title','alt','role','aria-label','aria-disabled','rel','data-id'])
        html=('<html><body><a href="/book" '+attributes+'>omitted</a></body></html>').encode()
        with self.assertRaises(Fault) as caught:
            structure_record(html,'https://example.org/books','sha256:'+'a'*64,lambda:None)
        self.assertEqual(caught.exception.code,'STRUCTURE_EMPTY')

    def test_parent_deadline_retires_the_structure_worker_as_failed(self):
        from scrapyjs_runner.manager import Manager
        fixture=ThreadingHTTPServer(('127.0.0.1',0),service_harness.Fixture)
        fixture.daemon_threads=True; fixture.hits=[]; fixture.release=threading.Event()
        threading.Thread(target=fixture.serve_forever,daemon=True).start()
        scope='http://127.0.0.1:'+str(fixture.server_port)
        try:
            with tempfile.TemporaryDirectory() as temp:
                manager=Manager(temp,[scope])
                try:
                    snap,_=manager.start({'requestId':'parent-structure-deadline','mode':'structure',
                        'config':{'url':scope+'/slow/2','inputHash':'sha256:'+'a'*64,'maxPages':20,'previewPages':3}},
                        {'owner':'deadline-test','scope':scope})
                    with manager.lock: manager.active['started']-=46
                    deadline=time.monotonic()+3
                    while manager.active and time.monotonic()<deadline: time.sleep(.05)
                    snap=manager.snapshot(snap['runId'],{'owner':'deadline-test','scope':scope})
                    self.assertTrue(snap['workerExited'],snap)
                    self.assertEqual(snap['status'],'FAILED'); self.assertFalse(snap['previewPassed'])
                    self.assertEqual(snap['stopReason'],'TIME_LIMIT')
                finally: manager.close()
        finally:
            fixture.release.set(); fixture.shutdown(); fixture.server_close()

    def test_structure_is_bounded_inert_and_does_not_collect_form_or_script_content(self):
        from scrapyjs_runner.structure import structure_record
        html=('<html><body><script>SCRIPT_SECRET</script><form><input value="FORM_SECRET"/>FORM_SECRET</form>'
              '<ul id="books">'+''.join('<li class="book"><h2>图书</h2><a href="/book/1">详情</a></li>' for _ in range(900))+
              '</ul><a href="javascript:SCRIPT_SECRET">下一页</a></body></html>').encode()
        record=structure_record(html,'https://example.org/books','sha256:'+'a'*64,lambda:None)
        self.assertTrue(record['truncated']); self.assertIn('id="books"',record['sample'])
        self.assertNotIn('SCRIPT_SECRET',record['sample']); self.assertNotIn('FORM_SECRET',record['sample'])
        self.assertLessEqual(len(record['sample'].encode()),8000)
        self.assertLessEqual(len(json.dumps(record,ensure_ascii=False).encode()),16384)
