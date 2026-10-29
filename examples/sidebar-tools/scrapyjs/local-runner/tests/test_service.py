"""Real loopback HTTP, real spawned workers, real Scrapling; no parser mocks."""
import csv
import http.client
import io
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

EXT='chrome-extension://'+'a'*32
ROOT=Path(__file__).resolve().parents[1]
EVIDENCE={}


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]


class Fixture(BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def do_GET(self):
        self.server.hits.append(self.path)
        if self.path=='/robots.txt':
            body=b'User-agent: *\nDisallow: /denied\n'; kind='text/plain'
        elif self.path=='/denied':
            body=b'<html>must never download</html>'; kind='text/html'
        elif self.path=='/redirect':
            self.send_response(302); self.send_header('Location','http://127.0.0.1:1/secret'); self.end_headers(); return
        elif self.path=='/redirect-denied':
            self.send_response(302); self.send_header('Location','/denied'); self.end_headers(); return
        elif self.path=='/large':
            self.send_response(200); self.send_header('Content-Length',str(3*1024*1024)); self.end_headers(); return
        elif self.path in ('/review/loop/alias','/review/entry','/review/start-alias'):
            destination={'/review/loop/alias':'/review/loop/list','/review/entry':'/review/final/list','/review/start-alias':'/review/start/page'}[self.path]
            self.send_response(302); self.send_header('Location',destination); self.end_headers(); return
        elif self.path.startswith('/review/'):
            controls={
                '/review/base/list':('<base target="_blank"><base href="/review/catalog/"><base href="/review/wrong/">','2','next'),
                '/review/final/list':('<base href="catalog/">','2','next'),
                '/review/cross-base':('<base href="http://127.0.0.1:1/catalog/">','2','next'),
                '/review/loop/list':('','/review/loop/alias','next'),
                '/review/start/page':('','/review/start/next','next'),
                '/review/disabled-is':('','/review/never','next is-disabled'),
                '/review/disabled-ant':('','/review/never','next ant-pagination-disabled')}
            base,href,classes=controls.get(self.path,('',None,''))
            ident='SECOND' if self.path in ('/review/catalog/2','/review/final/catalog/2','/review/start/next') else 'FIRST' if self.path in controls else 'WRONG'
            link=f'<a class="{classes}" href="{href}">Next</a>' if href else ''
            body=(f'<html><head>{base}</head><body><ul id="rows"><li><b>{ident}</b></li></ul>{link}</body></html>').encode(); kind='text/html'
        elif self.path=='/bulk/1':
            body=('<html><ul id=rows>'+''.join(f'<li><b>{i}</b><h2>row{i}</h2></li>' for i in range(2101))+'</ul></html>').encode(); kind='text/html'
        else:
            n=int(self.path.rsplit('/',1)[-1])
            if self.path.startswith('/slow/') and n>1:
                self.server.release.wait(12)
            prefix='/slow/' if self.path.startswith('/slow/') else '/page/'
            nextlink=f'<a class="next" href="{prefix}{n+1}">Next</a>' if n<3 else '<a class="next disabled" aria-disabled="true">Next</a>'
            body=(f'<html><meta charset="utf-8"><ul id="rows"><li><b>{n}</b><h2>第{n}页, "甲" &amp; 乙</h2><a href="/detail/{n}">链接{n}</a><i>A</i><i>B</i></li><li><b>{n}b</b><h2>空值{n}</h2></li><aside><li><h2>干扰</h2></li></aside></ul>{nextlink}</html>').encode(); kind='text/html; charset=utf-8'
        self.send_response(200); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body))); self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError): pass


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture); cls.fixture.daemon_threads=True
        cls.fixture.hits=[]; cls.fixture.release=threading.Event()
        threading.Thread(target=cls.fixture.serve_forever,daemon=True).start()
        cls.scope=f'http://127.0.0.1:{cls.fixture.server_port}'
        base=ROOT/'.test-data'; base.mkdir(exist_ok=True)
        cls.tmp=tempfile.TemporaryDirectory(dir=base); cls.directory=Path(cls.tmp.name)
        cls.port=free_port(); cls.endpoint=f'http://127.0.0.1:{cls.port}'
        cls.credential=cls.directory/'credential.json'
        cls.start_service()
        credential=json.loads(cls.credential.read_text()); cls.secret=credential['secret']
        if cls.credential.stat().st_mode & 0o777 != 0o600: raise AssertionError('Credential file must be mode 0600')
        if cls.directory.stat().st_mode & 0o777 != 0o700: raise AssertionError('Credential directory must be mode 0700')
        EVIDENCE['credentialInit']={'format':credential['format'],'endpoint':credential['endpoint'],'fileMode':'0600','directoryMode':'0700','secretCharacters':len(cls.secret),'secretPrinted':False}
        cls.token=cls.session('tool:install:hash')

    @classmethod
    def start_service(cls):
        original=cls.credential.read_bytes() if cls.credential.exists() else None
        cls.log=(cls.directory/'service.log').open('ab')
        cls.proc=subprocess.Popen([sys.executable,'-m','scrapyjs_runner','--port',str(cls.port),'--data-dir',str(cls.directory/'data'),'--credential-file',str(cls.credential),'--init-credential','--extension-origin',EXT,'--fixture-origin',cls.scope],cwd=ROOT,stdout=cls.log,stderr=cls.log)
        for _ in range(150):
            if cls.proc.poll() is not None:
                raise AssertionError('CLI failed: '+(cls.directory/'service.log').read_text())
            try:
                status,body=cls.call('/health',token=None)
                if status==200:
                    if original is not None and cls.credential.read_bytes()!=original: raise AssertionError('Existing credential was changed')
                    return
            except (URLError,TimeoutError): pass
            time.sleep(.05)
        raise AssertionError('CLI startup timed out')

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls,'proc') and cls.proc.poll() is None:
            cls.proc.terminate(); cls.proc.wait(timeout=10)
        cls.log.close()
        if cls.secret in (cls.directory/'service.log').read_text(): raise AssertionError('Credential leaked into service logs')
        cls.fixture.release.set(); cls.fixture.shutdown(); cls.fixture.server_close()
        EVIDENCE['runtime']={'python':sys.version.split()[0],'scrapling':__import__('importlib.metadata',fromlist=['version']).version('scrapling'),'fixtureOrigin':cls.scope,'endpoint':cls.endpoint}
        # Evidence never includes secrets, bearer headers or credential paths.
        (ROOT/'evidence'/'service-proof.json').write_text(json.dumps(EVIDENCE,ensure_ascii=False,indent=2)+'\n')
        cls.tmp.cleanup()

    @classmethod
    def call(cls,path,method='GET',data=None,token='default',origin=EXT,raw=False,headers=None):
        hdr={'Content-Type':'application/json'}
        if token=='default': token=cls.token
        if token: hdr['Authorization']='Bearer '+token
        if origin is not None: hdr['Origin']=origin
        if headers: hdr.update(headers)
        req=Request(cls.endpoint+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers=hdr)
        try: response=urlopen(req,timeout=10)
        except HTTPError as err: response=err
        with response:
            body=response.read()
            return response.status,body.decode() if raw else json.loads(body)

    @classmethod
    def session(cls,owner,scope=None):
        status,body=cls.call('/v1/session','POST',{'owner':owner,'origin':EXT,'scope':scope or cls.scope},cls.secret,origin=None)
        if status!=200: raise AssertionError((status,body))
        if not time.time()+850<body['expiresAt']<=time.time()+901: raise AssertionError('TTL must be Unix seconds')
        return body['token']

    def config(self,path='/page/1'):
        return {'url':self.scope+path,'itemConfig':{'_listContainer':'#rows','_listItem':'li','id':'b::text','title':'h2::text','href':'a::href','tags':{'selector':'i','read':'text','cardinality':'many'},'missing':'.absent::text','nested':{'link':{'selector':'a','read':'text','cardinality':'one'}}},'nextPageSelector':'a.next','maxPages':3}

    def start(self,config=None,mode='preview',pages=1,**extra):
        body={'requestId':secrets.token_hex(8),'mode':mode,'config':config or self.config(),'previewPages':pages,**extra}
        status,snap=self.call('/v1/runs','POST',body)
        self.assertEqual(status,202,snap)
        return body,snap

    def done(self,run_id):
        for _ in range(120):
            status,snap=self.call('/v1/runs/'+run_id)
            self.assertEqual(status,200,snap)
            if snap['workerExited']: return snap
            time.sleep(.05)
        self.fail('worker did not exit')

    def expected(self,n):
        rows=[]
        for p in range(1,n+1):
            rows.extend([{'id':str(p),'title':f'第{p}页, "甲" & 乙','href':f'/detail/{p}','tags':['A','B'],'missing':'','nested':{'link':f'链接{p}'}},{'id':f'{p}b','title':f'空值{p}','href':'','tags':[],'missing':'','nested':{'link':''}}])
        return rows

    def test_10_real_one_two_three_pages_and_every_export_field(self):
        for pages in (1,2,3):
            _,created=self.start(pages=pages); snap=self.done(created['runId'])
            self.assertEqual((snap['status'],snap['pagesVisited'],snap['recordsCount'],snap['previewPassed']),('COMPLETED',pages,pages*2,True),snap)
            _,data=self.call('/v1/runs/'+snap['runId']+'/records')
            self.assertEqual(data,{'records':self.expected(pages),'total':pages*2,'offset':0})
            for fmt in ('jsonl','csv'):
                status,raw=self.call('/v1/runs/'+snap['runId']+'/export?format='+fmt,raw=True)
                self.assertEqual(status,200)
                artifact=ROOT/'evidence'/f'pages-{pages}.{fmt}'
                artifact.write_text(raw,encoding='utf-8',newline='')
                readback=artifact.read_text(encoding='utf-8')
                if fmt=='jsonl': decoded=[json.loads(line) for line in readback.splitlines()]
                else:
                    decoded=list(csv.DictReader(io.StringIO(readback)))
                    for row in decoded:
                        row['tags']=json.loads(row['tags']); row['nested']=json.loads(row['nested'])
                self.assertEqual(decoded,self.expected(pages),fmt)
            EVIDENCE[str(pages)+'-page']={'snapshot':snap,'records':data['records'],'jsonlEveryFieldEqual':True,'csvEveryFieldEqual':True}

    def test_20_full_requires_exact_preview_and_request_lookup_never_replays(self):
        cfg=self.config()
        bad={'requestId':'missing-preview','mode':'full','config':cfg}
        self.assertEqual(self.call('/v1/runs','POST',bad)[0],409)
        body,created=self.start(); preview=self.done(created['runId'])
        original=preview['runId']; before=len(self.fixture.hits)
        self.assertEqual(self.call('/v1/runs','POST',body)[1]['runId'],original)
        self.assertEqual(self.call('/v1/runs/by-request/'+body['requestId'])[1]['runId'],original)
        changed={**body,'previewPages':2}
        self.assertEqual(self.call('/v1/runs','POST',changed)[0],409)
        self.assertEqual(len(self.fixture.hits),before)
        tampered=self.config(); tampered['maxPages']=2
        for change in [{'configHash':'sha256:wrong'},{'config':tampered}]:
            request={'requestId':secrets.token_hex(8),'mode':'full','config':cfg,'previewRunId':original,'configHash':preview['configHash'],**change}
            self.assertEqual(self.call('/v1/runs','POST',request)[0],409)
        fresh=self.session('tool:install:hash')
        self.assertEqual(self.call('/v1/runs/by-request/'+body['requestId'],token=fresh)[1]['runId'],original)
        _,created=self.start(mode='full',previewRunId=original,configHash=preview['configHash'])
        full=self.done(created['runId']); self.assertEqual((full['status'],full['pagesVisited']),('COMPLETED',3))
        self.assertEqual(full['configHash'],preview['configHash'])
        _,full_export=self.call('/v1/runs/'+full['runId']+'/export?format=jsonl',raw=True)
        (ROOT/'evidence'/'full.jsonl').write_text(full_export)
        self.assertEqual([json.loads(line) for line in (ROOT/'evidence'/'full.jsonl').read_text().splitlines()],self.expected(3))
        EVIDENCE['full']={'sameConfigHash':True,'exportReadbackEveryFieldEqual':True,'snapshot':full,'exactPreviewEnforced':True,'requestRecoveryNoReplay':True,'sameOwnerSessionRefresh':True}

    def test_30_auth_origin_owner_scope_body_robots_and_redirect(self):
        self.assertEqual(self.call('/unknown')[1].get('error',{}).get('code'),'NOT_FOUND')
        self.assertEqual(self.call('/v1/session')[1].get('error',{}).get('code'),'METHOD_NOT_ALLOWED')
        for token,origin in [(None,EXT),(self.secret,EXT),(self.token,'null'),(self.token,'https://evil.example'),(self.token,'chrome-extension://'+'b'*32)]:
            self.assertIn(self.call('/v1/runs/unknown',token=token,origin=origin)[0],(401,403))
        self.assertEqual(self.call('/health',token=None,origin=None)[0],200)
        _,created=self.start(); snap=self.done(created['runId'])
        other=self.session('different:install:hash')
        self.assertEqual(self.call('/v1/runs/'+snap['runId'],token=other)[0],404)
        scoped=self.session('tool:install:hash','https://example.org')
        self.assertEqual(self.call('/v1/runs/'+snap['runId'],token=scoped)[0],404)
        self.assertEqual(self.call('/v1/runs','POST',{'requestId':'scope-escape','mode':'preview','config':self.config()},token=scoped)[0],403)
        self.assertEqual(self.call('/v1/runs','POST',{'x':'x'*17000})[0],413)
        for path,code in [('/denied','ROBOTS_DENIED'),('/redirect','SCOPE_MISMATCH'),('/redirect-denied','ROBOTS_DENIED'),('/large','RESPONSE_TOO_LARGE')]:
            cfg=self.config(path); cfg.pop('nextPageSelector')
            _,created=self.start(config=cfg); snap=self.done(created['runId'])
            self.assertEqual(snap['status'],'FAILED',snap); self.assertEqual(snap['errors'][0]['code'],code,snap)
        self.assertNotIn('/denied',self.fixture.hits)
        EVIDENCE['security']={'authOriginOwnerScope':True,'bodyLimit':True,'robotsDeniedBeforeDownload':True,'redirectScopeDenied':True,'redirectRobotsDenied':True,'responseLimit':True}

    def test_35_record_budget_stops_normally_and_preview_remains_usable(self):
        cfg=self.config('/bulk/1'); cfg.pop('nextPageSelector')
        _,r=self.start(config=cfg); snap=self.done(r['runId'])
        self.assertEqual((snap['status'],snap['recordsCount'],snap['stopReason'],snap['errors'],snap['previewPassed']),('COMPLETED',2000,'RECORD_LIMIT',[],True),snap)
        _,r=self.start(config=cfg,mode='full',previewRunId=snap['runId'],configHash=snap['configHash'])
        full=self.done(r['runId'])
        self.assertEqual((full['status'],full['recordsCount'],full['stopReason']),('COMPLETED',2000,'RECORD_LIMIT'),full)
        EVIDENCE['recordBudget']={'snapshot':full,'nonErrorStop':True,'previewStillUsable':True}

    @staticmethod
    def worker_pids(parent):
        output=subprocess.check_output(['ps','-axo','pid=,ppid=,command='],text=True)
        found=[]
        for line in output.splitlines():
            parts=line.strip().split(None,2)
            if len(parts)==3 and parts[1]==str(parent) and 'multiprocessing.spawn' in parts[2]: found.append(int(parts[0]))
        return found

    def assert_pids_exited(self,pids):
        self.assertTrue(pids,'Must observe the original live worker PID')
        for pid in pids:
            with self.assertRaises(ProcessLookupError): os.kill(pid,0)

    def test_40_stop_waits_and_restart_interrupts_without_replay(self):
        cfg=self.config('/slow/1')
        _,p=self.start(config=cfg); preview=self.done(p['runId'])
        body,r=self.start(config=cfg,mode='full',previewRunId=preview['runId'],configHash=preview['configHash'])
        for _ in range(100):
            _,s=self.call('/v1/runs/'+r['runId'])
            if s['pagesVisited']>=1: break
            time.sleep(.05)
        busy={'requestId':'must-not-queue','mode':'preview','config':cfg}
        self.assertEqual(self.call('/v1/runs','POST',busy)[0],409)
        self.assertEqual(self.call('/v1/runs/by-request/must-not-queue')[0],404)
        stopped_pids=self.worker_pids(self.proc.pid)
        status,stopped=self.call('/v1/runs/'+r['runId']+'/stop','POST',{})
        self.assertEqual((status,stopped['status'],stopped['workerExited']),(200,'STOPPED',True),stopped)
        self.assert_pids_exited(stopped_pids)
        self.assertEqual(self.call('/v1/runs/'+r['runId']+'/stop','POST',{})[1]['status'],'STOPPED')
        interrupted_body,r=self.start(config=cfg,mode='full',previewRunId=preview['runId'],configHash=preview['configHash'])
        for _ in range(100):
            _,s=self.call('/v1/runs/'+r['runId'])
            if s['pagesVisited']>=1: break
            time.sleep(.05)
        interrupted_pids=self.worker_pids(self.proc.pid)
        self.proc.kill(); self.proc.wait(timeout=5); self.log.close()
        time.sleep(.4); self.start_service(); type(self).token=self.session('tool:install:hash')
        _,interrupted=self.call('/v1/runs/'+r['runId'])
        self.assertEqual((interrupted['status'],interrupted['workerExited']),('INTERRUPTED',True),interrupted)
        self.assert_pids_exited(interrupted_pids)
        before=len(self.fixture.hits)
        # Original full request cannot be retried under a new identity by recovery.
        self.assertEqual(self.call('/v1/runs/by-request/'+interrupted['requestId'])[1]['runId'],r['runId'])
        status,recovered=self.call('/v1/runs','POST',interrupted_body)
        self.assertEqual((status,recovered['runId'],recovered['status']),(200,r['runId'],'INTERRUPTED'))
        time.sleep(.2); self.assertEqual(len(self.fixture.hits),before)
        _,records=self.call('/v1/runs/'+r['runId']+'/records')
        self.assertEqual(records['records'],self.expected(1))
        disk_records=[json.loads(line) for line in (self.directory/'data'/(r['runId']+'.jsonl')).read_text().splitlines()]
        self.assertEqual(disk_records,self.expected(1))
        EVIDENCE['lifecycle']={'diskJsonlRecoveredEveryFieldEqual':True,'stopped':stopped,'afterRestart':interrupted,'recordsPersisted':True,'restartNoReplay':True,'stoppedOriginalPids':stopped_pids,'interruptedOriginalPids':interrupted_pids,'originalPidsExited':True}

    def test_50_revoke_waits_and_invalidates_only_owner(self):
        cfg=self.config('/slow/1'); _,p=self.start(config=cfg); preview=self.done(p['runId'])
        _,r=self.start(config=cfg,mode='full',previewRunId=preview['runId'],configHash=preview['configHash'])
        other=self.session('other:install:hash')
        status,body=self.call('/v1/revoke','POST',{'owner':'tool:install:hash'},token=self.secret,origin=None)
        self.assertEqual((status,body),(200,{'revoked':True,'workerExited':True}))
        self.assertEqual(self.call('/v1/runs/'+r['runId'])[0],401)
        self.assertEqual(self.call('/v1/runs/unknown',token=other)[0],404)
        type(self).token=self.session('tool:install:hash')
        self.assertTrue(self.call('/v1/runs/'+r['runId'])[1]['workerExited'])
        EVIDENCE['revoke']=body

    def test_55_chunked_body_is_bounded_and_sessions_rate_limited(self):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        try:
            conn.request('POST','/v1/session',body=iter([b'x'*7000]*3),headers={'Authorization':'Bearer '+self.secret,'Content-Type':'application/json','Origin':EXT},encode_chunked=True)
            response=conn.getresponse(); self.assertEqual(response.status,413); response.read()
        finally: conn.close()
        statuses=[]
        for _ in range(31):
            statuses.append(self.call('/v1/session','POST',{'owner':'rate:install:hash','origin':EXT,'scope':self.scope},token=self.secret,origin=None)[0])
        self.assertIn(429,statuses)
        self.assertEqual(statuses[-1],429)
        EVIDENCE['limits']={'chunkedBodyBounded':True,'sessionRateLimited':True}

    def review_config(self,path):
        return {'url':self.scope+path,'itemConfig':{'_listContainer':'#rows','_listItem':'li','id':'b::text'},'nextPageSelector':'a.next','maxPages':3}

    def test_60_review_base_uri_uses_first_href_and_final_response_url(self):
        observations=[]
        for path,expected_next in [('/review/base/list','/review/catalog/2'),('/review/entry','/review/final/catalog/2')]:
            before=len(self.fixture.hits)
            _,r=self.start(config=self.review_config(path),pages=3); snap=self.done(r['runId'])
            _,data=self.call('/v1/runs/'+r['runId']+'/records')
            self.assertEqual((snap['status'],snap['pagesVisited'],data['records']),('COMPLETED',2,[{'id':'FIRST'},{'id':'SECOND'}]),snap)
            hits=self.fixture.hits[before:]; self.assertIn(expected_next,hits)
            observations.append({'seed':path,'expectedNext':expected_next,'requests':hits,'snapshot':snap,'records':data['records']})
        EVIDENCE['reviewBaseURI']=observations

    def test_61_review_cross_scope_base_is_denied_before_following(self):
        before=len(self.fixture.hits)
        _,r=self.start(config=self.review_config('/review/cross-base'),pages=3); snap=self.done(r['runId'])
        self.assertEqual((snap['status'],snap['stopReason'],snap['pagesVisited']),('FAILED','SCOPE_MISMATCH',1),snap)
        hits=self.fixture.hits[before:]; self.assertEqual(hits,['/robots.txt','/review/cross-base'])
        EVIDENCE['reviewCrossScopeBase']={'requests':hits,'snapshot':snap}

    def test_62_review_redirect_to_visited_document_never_commits_twice(self):
        before=len(self.fixture.hits)
        _,r=self.start(config=self.review_config('/review/loop/list'),pages=3); snap=self.done(r['runId'])
        self.assertEqual((snap['status'],snap['stopReason'],snap['pagesVisited'],snap['recordsCount']),('FAILED','PAGINATION_LOOP',1,1),snap)
        _,data=self.call('/v1/runs/'+r['runId']+'/records'); self.assertEqual(data['records'],[{'id':'FIRST'}])
        _,raw=self.call('/v1/runs/'+r['runId']+'/export?format=jsonl',raw=True)
        self.assertEqual([json.loads(line) for line in raw.splitlines()],[{'id':'FIRST'}])
        self.assertEqual(snap['completeness']['id'],{'total':1,'nonEmpty':1,'ratio':1.0})
        EVIDENCE['reviewRedirectDuplicate']={'requests':self.fixture.hits[before:],'snapshot':snap,'export':data['records']}
        _,r=self.start(config=self.review_config('/review/start-alias'),pages=3); valid=self.done(r['runId'])
        self.assertEqual((valid['status'],valid['pagesVisited'],valid['recordsCount']),('COMPLETED',2,2),valid)
        EVIDENCE['reviewInitialAlias']={'snapshot':valid}

    def test_63_review_existing_disabled_classes_are_final_pages(self):
        observations=[]
        for path in ('/review/disabled-is','/review/disabled-ant'):
            before=len(self.fixture.hits)
            _,r=self.start(config=self.review_config(path),pages=3); snap=self.done(r['runId'])
            self.assertEqual((snap['status'],snap['stopReason'],snap['pagesVisited'],snap['recordsCount']),('COMPLETED','NO_NEXT_PAGE',1,1),snap)
            hits=self.fixture.hits[before:]; self.assertEqual(hits,['/robots.txt',path])
            observations.append({'requests':hits,'snapshot':snap})
        EVIDENCE['reviewDisabledClasses']=observations

if __name__=='__main__': unittest.main()
