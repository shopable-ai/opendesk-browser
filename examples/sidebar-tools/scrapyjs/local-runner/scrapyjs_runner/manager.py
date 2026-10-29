import fcntl
import json
import multiprocessing
import os
from pathlib import Path
import re
import threading
import time
import uuid
from .dsl import canonical,compile_config,config_hash
from .errors import Fault
from .security import target_url
from .storage import Store,TERMINAL
from .worker import run_worker


class Manager:
    def __init__(self,directory,fixtures):
        self.directory=Path(directory)
        self.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        meta=self.directory.lstat()
        if self.directory.is_symlink() or meta.st_uid!=os.getuid() or meta.st_mode & 0o077:
            raise Fault('DATA_DIRECTORY','data-dir must be a private directory owned by the service user',503)
        # Do not follow externally planted database/lease/mirror symlinks.
        for path in self.directory.iterdir():
            if path.is_symlink() or not path.is_file() or path.stat().st_uid!=os.getuid():
                raise Fault('DATA_DIRECTORY','Unsafe data directory entry',503)
        self.lease=(self.directory/'service.lock').open('a+b')
        try: fcntl.flock(self.lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.lease.close(); raise Fault('SERVICE_ALREADY_RUNNING',status=503) from None
        self.lock=threading.RLock(); self.active=None; self.closing=False
        self.context=multiprocessing.get_context('spawn')
        self.store=Store(directory); self.boot=str(uuid.uuid4()); self.fixtures=fixtures
        try:
            self.store.initialize(self.boot)
            # A previous child must really release its lease before recovery can
            # report workerExited. Its parent watchdog normally takes <1 second.
            with (self.directory/'worker.lock').open('a+b') as worker_lease:
                deadline=time.monotonic()+5
                while True:
                    try:
                        fcntl.flock(worker_lease,fcntl.LOCK_EX|fcntl.LOCK_NB); break
                    except BlockingIOError:
                        if time.monotonic()>=deadline: raise Fault('OLD_WORKER_ACTIVE',status=503)
                        time.sleep(.05)
                self.store.recover()
        except BaseException:
            self.lease.close(); raise

    def authorized(self,run_id,grant):
        row=self.store.get(run_id)
        if not row or row['owner']!=grant['owner'] or row['scope']!=grant['scope']:
            raise Fault('NOT_FOUND',status=404)
        return row

    def snapshot(self,run_id,grant):
        with self.lock:
            self.reap()
            return json.loads(self.authorized(run_id,grant)['snapshot'])

    def by_request(self,request_id,grant):
        with self.lock:
            self.reap()
            row=self.store.by_request(grant['owner'],request_id)
            if not row or row['scope']!=grant['scope']: raise Fault('NOT_FOUND',status=404)
            return json.loads(row['snapshot'])

    def start(self,body,grant):
        with self.lock:
            self.reap()
            if self.closing: raise Fault('SERVICE_CLOSING',status=503)
            if not isinstance(body,dict) or set(body)-{'requestId','mode','config','previewPages','previewRunId','configHash'}:
                raise Fault('INVALID_REQUEST')
            request=body.get('requestId'); mode=body.get('mode')
            if not isinstance(request,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,127}',request) or mode not in ('preview','full'):
                raise Fault('INVALID_REQUEST')
            signature=canonical(body)
            previous=self.store.by_request(grant['owner'],request)
            if previous:
                if previous['signature']!=signature or previous['scope']!=grant['scope']:
                    raise Fault('IDEMPOTENCY_CONFLICT','Request identity already exists with a different payload or scope',409)
                return json.loads(previous['snapshot']),False
            cfg=body.get('config'); compiled=compile_config(cfg)
            target_url(cfg['url'],grant['scope'])
            pages=body.get('previewPages',1)
            if type(pages) is not int or not 1<=pages<=3: raise Fault('INVALID_PREVIEW_PAGES')
            digest=config_hash(cfg); preview_id=body.get('previewRunId')
            if mode=='full':
                if not isinstance(preview_id,str) or body.get('configHash')!=digest:
                    raise Fault('PREVIEW_REQUIRED','Full run requires the exact successful preview ID and configHash',409)
                previous_preview=self.store.get(preview_id)
                if not previous_preview or previous_preview['owner']!=grant['owner'] or previous_preview['scope']!=grant['scope']:
                    raise Fault('PREVIEW_REQUIRED',status=409)
                preview=json.loads(previous_preview['snapshot'])
                if preview['mode']!='preview' or not preview['previewPassed'] or preview['status']!='COMPLETED' or not preview['workerExited'] or preview['recordsCount']<=0 or preview['configHash']!=digest or canonical(preview['config'])!=canonical(cfg):
                    raise Fault('PREVIEW_MISMATCH','Preview is not a successful nonempty exact snapshot',409)
            elif preview_id is not None or body.get('configHash') not in (None,digest):
                raise Fault('INVALID_PREVIEW_BINDING')
            if self.active: raise Fault('WORKER_BUSY','Only one worker may run at a time',409)
            run_id=str(uuid.uuid4()); fields=list(compiled['fields'])
            snap={'runId':run_id,'requestId':request,'previewRunId':preview_id,'configHash':digest,'mode':mode,'status':'RUNNING','pagesVisited':0,'recordsCount':0,'fields':fields,'completeness':{key:{'nonEmpty':0,'total':0,'ratio':0.0} for key in fields},'errors':[],'stopReason':None,'workerExited':False,'previewPassed':False,'config':cfg,'scope':grant['scope']}
            self.store.create(grant['owner'],grant['scope'],request,signature,snap)
            stop=self.context.Event()
            process=self.context.Process(target=run_worker,args=(str(self.directory),run_id,self.boot,os.getpid(),stop,self.fixtures,pages),daemon=True)
            try: process.start()
            except Exception:
                snap=self.store.update(run_id,{'status':'FAILED','stopReason':'SPAWN_FAILED','errors':[{'code':'SPAWN_FAILED','message':'Worker could not start'}],'workerExited':True})
                return snap,True
            self.active={'id':run_id,'owner':grant['owner'],'process':process,'stop':stop,'started':time.monotonic()}
            threading.Thread(target=self.watch,args=(run_id,),daemon=True).start()
            return snap,True

    def watch(self,run_id):
        while True:
            with self.lock:
                if not self.active or self.active['id']!=run_id: return
                if time.monotonic()-self.active['started']>=1800:
                    self.stop_active('TIME_LIMIT'); return
                self.reap()
                if not self.active: return
            time.sleep(.05)

    def reap(self):
        if not self.active or self.active['process'].is_alive(): return
        active=self.active; process=active['process']; process.join()
        row=self.store.get(active['id']); snap=json.loads(row['snapshot'])
        outcome=json.loads(row['outcome']) if row['outcome'] else {'status':'FAILED','stopReason':'WORKER_EXIT','errors':[{'code':'WORKER_EXIT','message':'Worker exited without a completion receipt'}]}
        if snap['status']=='STOPPING':
            reason=snap['stopReason'] or 'STOP_REQUESTED'
            outcome={'status':'INTERRUPTED' if reason=='SERVICE_SHUTDOWN' else 'COMPLETED' if reason=='TIME_LIMIT' else 'STOPPED','stopReason':reason,'errors':[]}
        preview_passed=(snap['mode']=='preview' and outcome['status']=='COMPLETED' and snap['recordsCount']>0 and not outcome['errors'])
        self.store.mirror(active['id'])
        self.store.update(active['id'],{**outcome,'workerExited':True,'previewPassed':preview_passed})
        process.close(); self.active=None

    def stop_active(self,reason='STOP_REQUESTED'):
        if not self.active: return
        active=self.active
        self.store.update(active['id'],{'status':'STOPPING','stopReason':reason,'previewPassed':False})
        active['stop'].set(); process=active['process']; process.join(timeout=1.5)
        if process.is_alive(): process.terminate(); process.join(timeout=1.5)
        if process.is_alive(): process.kill(); process.join(timeout=1.5)
        if process.is_alive(): raise Fault('WORKER_DID_NOT_EXIT','Worker is still active; cleanup is not confirmed',503)
        self.reap()

    def stop(self,run_id,grant):
        with self.lock:
            self.reap(); self.authorized(run_id,grant)
            if self.active and self.active['id']==run_id: self.stop_active()
            return json.loads(self.authorized(run_id,grant)['snapshot'])

    def revoke(self,owner):
        with self.lock:
            self.reap()
            if self.active and self.active['owner']==owner: self.stop_active('OWNER_REVOKED')

    def close(self):
        with self.lock:
            self.closing=True
            self.stop_active('SERVICE_SHUTDOWN')
            self.lease.close()
