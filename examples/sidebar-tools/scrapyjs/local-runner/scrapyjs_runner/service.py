import asyncio
from collections import deque
from contextlib import asynccontextmanager
import csv
import io
from importlib.metadata import version
import json
import re
import threading
import time
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse,StreamingResponse,Response
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException
from . import __version__
from .errors import Fault
from .security import Sessions,strict_json


class Boundary:
    """ASGI boundary caps actual body bytes, including chunked requests."""
    def __init__(self,app,port,extensions):
        self.app=app; self.host=f'127.0.0.1:{port}'; self.extensions=set(extensions)
        self.rates={}; self.rate_lock=threading.Lock()

    async def __call__(self,scope,receive,send):
        if scope['type']!='http': return await self.app(scope,receive,send)
        pairs=scope['headers']; headers={}
        try:
            for name,value in pairs:
                key=name.decode('latin1').lower()
                if key in headers and key in {'host','origin','authorization','content-length','content-type','transfer-encoding'}:
                    raise Fault('AMBIGUOUS_HEADERS',status=400)
                headers[key]=value.decode('latin1')
            origin=headers.get('origin')
            if headers.get('host')!=self.host: raise Fault('HOST_DENIED',status=403)
            if origin is not None and origin not in self.extensions: raise Fault('ORIGIN_DENIED',status=403)
            path=scope['path']; method=scope['method']
            # Bounded key space: classify routes, never index by attacker strings.
            group='session' if path=='/v1/session' else 'revoke' if path=='/v1/revoke' else 'start' if method=='POST' and path=='/v1/runs' else 'export' if path.endswith('/export') else 'read'
            maximum={'session':30,'revoke':30,'start':30,'export':30,'read':1200}[group]
            with self.rate_lock:
                now=time.monotonic(); hits=self.rates.setdefault(group,deque())
                while hits and hits[0]<=now-60: hits.popleft()
                if len(hits)>=maximum: raise Fault('RATE_LIMIT',status=429)
                hits.append(now)
            if method=='OPTIONS':
                if origin is None or headers.get('access-control-request-method') not in ('GET','POST'):
                    raise Fault('PREFLIGHT_DENIED',status=403)
                requested={h.strip().lower() for h in headers.get('access-control-request-headers','').split(',') if h.strip()}
                if requested-{'authorization','content-type'}: raise Fault('PREFLIGHT_DENIED',status=403)
                response=Response(status_code=204,headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin','Cache-Control':'no-store'})
                return await response(scope,receive,send)
            length=headers.get('content-length')
            if length is not None and (not length.isdigit() or int(length)>16384):
                raise Fault('BODY_TOO_LARGE',status=413)
            chunks=[]; size=0
            async def read_body():
                nonlocal size
                while True:
                    item=await receive()
                    if item['type']=='http.disconnect': raise Fault('CLIENT_DISCONNECTED',status=400)
                    chunk=item.get('body',b''); size+=len(chunk)
                    if size>16384: raise Fault('BODY_TOO_LARGE',status=413)
                    chunks.append(chunk)
                    if not item.get('more_body',False): break
            try: await asyncio.wait_for(read_body(),timeout=5)
            except asyncio.TimeoutError: raise Fault('BODY_TIMEOUT',status=408) from None
            if method=='POST' and size and headers.get('content-type','').split(';')[0].strip().lower()!='application/json':
                raise Fault('CONTENT_TYPE',status=415)
            body=b''.join(chunks); supplied=False
            async def replay():
                nonlocal supplied
                if not supplied:
                    supplied=True
                    return {'type':'http.request','body':body,'more_body':False}
                return await receive()
            async def response_send(message):
                if message['type']=='http.response.start':
                    extra=[(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff')]
                    if origin is not None: extra.extend([(b'access-control-allow-origin',origin.encode()),(b'vary',b'Origin')])
                    message['headers']=list(message.get('headers',[]))+extra
                await send(message)
            await self.app(scope,replay,response_send)
        except Fault as err:
            extra={'Cache-Control':'no-store'}
            permitted=headers.get('origin')
            if permitted in self.extensions: extra.update({'Access-Control-Allow-Origin':permitted,'Vary':'Origin'})
            await JSONResponse({'error':err.public()},status_code=err.status,headers=extra)(scope,receive,send)


def create_app(manager,master,extensions,port):
    sessions=Sessions(master,extensions)
    exports=threading.BoundedSemaphore(2)
    @asynccontextmanager
    async def lifespan(_):
        yield
        await asyncio.to_thread(manager.close)
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    app.add_middleware(Boundary,port=port,extensions=extensions)

    @app.exception_handler(Fault)
    async def failure(_,error):
        return JSONResponse({'error':error.public()},status_code=error.status)

    @app.exception_handler(HTTPException)
    async def http_failure(_,error):
        code={404:'NOT_FOUND',405:'METHOD_NOT_ALLOWED'}.get(error.status_code,'HTTP_ERROR')
        return JSONResponse({'error':{'code':code,'message':code}},status_code=error.status_code)

    @app.exception_handler(Exception)
    async def unexpected(_,error):
        return JSONResponse({'error':{'code':'INTERNAL_ERROR','message':'Service operation failed; do not replay an unknown POST'}},status_code=500)

    def bearer(req):
        header=req.headers.get('authorization','')
        if not header.startswith('Bearer ') or len(header)>4200 or not header[7:]: raise Fault('UNAUTHORIZED',status=401)
        return header[7:]

    def grant(req): return sessions.check(bearer(req),req.headers.get('origin'))

    async def body(req):
        obj=strict_json(await req.body())
        if not isinstance(obj,dict): raise Fault('INVALID_REQUEST')
        return obj

    @app.get('/health')
    def health():
        return {'status':'ok','service':'scrapyjs-local-runner','version':__version__,'scraplingVersion':version('scrapling')}

    @app.post('/v1/session')
    async def session(req:Request):
        sessions.master_auth(bearer(req)); obj=await body(req)
        with manager.lock: return sessions.create(obj,req.headers.get('origin'))

    @app.post('/v1/revoke')
    async def revoke(req:Request):
        sessions.master_auth(bearer(req)); obj=await body(req)
        if set(obj)!={'owner'} or not isinstance(obj['owner'],str) or not 1<=len(obj['owner'])<=256: raise Fault('INVALID_OWNER')
        def cleanup():
            with manager.lock:
                # Tokens are revoked even if process cleanup fails. Never claim
                # workerExited when stop/kill/join has not actually succeeded.
                sessions.revoke(obj['owner']); manager.revoke(obj['owner'])
                return {'revoked':True,'workerExited':True}
        return await asyncio.to_thread(cleanup)

    @app.post('/v1/runs')
    async def start(req:Request):
        # Recheck inside the manager lock so an in-flight revoke cannot race a
        # previously authorized request into a new worker.
        grant(req); obj=await body(req)
        def launch():
            with manager.lock: return manager.start(obj,grant(req))
        snap,created=await asyncio.to_thread(launch)
        return JSONResponse(snap,status_code=202 if created else 200)

    # Register this route before /{run_id}; unknown POST recovery is read-only.
    @app.get('/v1/runs/by-request/{request_id}')
    def by_request(request_id:str,req:Request):
        return manager.by_request(request_id,grant(req))

    @app.get('/v1/runs/{run_id}')
    def snapshot(run_id:str,req:Request): return manager.snapshot(run_id,grant(req))

    @app.get('/v1/runs/{run_id}/records')
    def records(run_id:str,req:Request):
        current=manager.snapshot(run_id,grant(req))
        try:
            if set(req.query_params)-{'offset','limit'}: raise ValueError()
            offset=int(req.query_params.get('offset','0')); limit=int(req.query_params.get('limit','50'))
            if not 0<=offset<=2000 or not 1<=limit<=200: raise ValueError()
        except ValueError: raise Fault('INVALID_PAGINATION',status=400) from None
        return {'records':[json.loads(value) for value in manager.store.values(run_id,offset,min(limit,max(0,current['recordsCount']-offset)))],'total':current['recordsCount'],'offset':offset}

    @app.post('/v1/runs/{run_id}/stop')
    def stop(run_id:str,req:Request):
        with manager.lock: return manager.stop(run_id,grant(req))

    @app.get('/v1/runs/{run_id}/export')
    def export(run_id:str,req:Request):
        current=manager.snapshot(run_id,grant(req))
        fmt=req.query_params.get('format','jsonl')
        if fmt not in ('jsonl','csv') or set(req.query_params)-{'format'}: raise Fault('INVALID_FORMAT',status=400)
        if not exports.acquire(blocking=False): raise Fault('EXPORT_LIMIT',status=429)
        def stream():
            if fmt=='jsonl':
                for value in manager.store.values(run_id,0,current['recordsCount']): yield value+'\n'
            else:
                buffer=io.StringIO(); writer=csv.writer(buffer)
                writer.writerow(current['fields']); yield buffer.getvalue()
                for value in manager.store.values(run_id,0,current['recordsCount']):
                    record=json.loads(value); cells=[]
                    for field in current['fields']:
                        cell=record.get(field)
                        cells.append(json.dumps(cell,ensure_ascii=False,separators=(',',':')) if isinstance(cell,(dict,list)) or cell is None else cell)
                    buffer.seek(0); buffer.truncate(0); writer.writerow(cells); yield buffer.getvalue()
        return StreamingResponse(stream(),media_type='application/x-ndjson' if fmt=='jsonl' else 'text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="{run_id}.{fmt}"'},background=BackgroundTask(exports.release))
    return app
