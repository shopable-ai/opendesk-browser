// Test-only observation support extracted from native-double-task's
// MutationObserver + same-origin sendBeacon fixture. Never submits a Job,
// fills a form, clicks, installs, reads credentials or controls Chrome.
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const keys=['sessionId','documentInstance','eventSeq','type','url','name','done','at'];
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
const rootDocument=`<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenDesk 本地测试入口</title>
<h1>OpenDesk 本地测试入口</h1>
<p>本页是普通本地文档。打开页面不会填写表单或运行任务。</p>
<p><a href="/demo-form.html">打开 Browser Test Lab</a></p>
</html>
`;

// This function runs only in the original standard document. Reading DOM
// state and observing events must never change its business behavior.
function observeForm(config){
  let eventSeq=0,previousDone=null,previousText=null;
  const emit=type=>{
    const done=document.querySelector('#done');
    navigator.sendBeacon('/__opendesk_cloud_proof',JSON.stringify({
      sessionId:config.sessionId,documentInstance:config.documentInstance,
      eventSeq:++eventSeq,type,url:location.href,
      name:document.querySelector('#name')?.value??'',
      done:done?.textContent??null,at:new Date().toISOString(),
    }));
  };
  document.addEventListener('submit',event=>{
    if(event.target?.id==='demo-form')emit('submit');
  },true);
  new MutationObserver(()=>{
    const done=document.querySelector('#done'),text=done?.textContent??null;
    if(done!==previousDone||text!==previousText){
      previousDone=done;previousText=text;emit('done');
    }
  }).observe(document,{subtree:true,childList:true,characterData:true});
  emit('ready');
}

async function persist(filename,value,{append=false}={}){
  const handle=await open(filename,append?'a':'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}
  finally{await handle.close();}
}

export async function startPassiveFormProof({directory,port=43111}={}){
  if(!directory||!Number.isInteger(port)||port<0||port>65535)throw Error('PROOF_OPTIONS_REQUIRED');
  directory=path.resolve(directory);
  // A fresh directory is mandatory: never overwrite/reuse an old evidence
  // session, or turn a service restart into apparent event continuity.
  await mkdir(directory,{mode:0o700});
  await mkdir(path.join(directory,'documents'),{mode:0o700});
  await writeFile(path.join(directory,'root-requests.jsonl'),'',{flag:'wx',mode:0o600});
  const staticRoot=await realpath(path.join(root,'examples/tasks'));
  const original=await readFile(path.join(staticRoot,'demo-form.html'),'utf8');
  if(!original.includes('</body>'))throw Error('STANDARD_PAGE_BODY_REQUIRED');
  const task=await verifyTaskPackage(JSON.parse(await readFile(
    path.join(staticRoot,'form-fill.v1.opendesk-task.json'),'utf8')));
  const taskIdentity={taskId:task.manifest.taskId,version:task.manifest.version,
    manifestHash:task.manifestHash,sourceHash:task.manifest.program.sourceHash};
  const viewerFiles=new Map([
    ['/cloud-proof.html',['proof.html','text/html; charset=utf-8']],
    ['/cloud-proof.js',['proof.js','text/javascript; charset=utf-8']],
    ['/cloud-proof.css',['style.css','text/css; charset=utf-8']],
  ]);
  const observerSource='('+observeForm.toString()+')';
  const sessionId=randomUUID(),documents=new Map(),events=[];
  let url,origin,receiveSeq=0,writeQueue=Promise.resolve(),failure=null;
  let rootRequestSeq=0,rootQueue=Promise.resolve(),rootFailure=null;
  const enqueue=action=>{
    const pending=writeQueue.then(()=>{if(failure)throw failure;return action();});
    writeQueue=pending.catch(error=>{failure=error;});
    return pending;
  };
  const server=createServer((req,res)=>{
    const reply=(status,body='')=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end(body);};
    (async()=>{
      if(req.headers.host!==new URL(origin).host)return reply(403);
      if(req.url==='/__opendesk_cloud_proof/query'){
        if(req.method!=='POST')return reply(405);
        if(req.headers.origin!==origin)return reply(403);
        let size=0;const chunks=[];
        for await(const chunk of req){
          size+=chunk.length;if(size>1024)return reply(413);chunks.push(chunk);
        }
        let input;
        try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400);}
        if(!input||Array.isArray(input)||Object.keys(input).length!==1||
          typeof input.name!=='string'||input.name.length<1||input.name.length>40)return reply(400);
        await writeQueue;if(failure)return reply(503);
        // Read only committed observations; neither this query nor the viewer
        // can trigger a Task or turn page observations into native evidence.
        const matched=new Set(events.filter(e=>e.name===input.name).map(e=>e.documentInstance));
        const expectedDone=input.name.trim()?'已提交：'+input.name.trim():null;
        const selected=[...matched].map(documentInstance=>{
          const document=documents.get(documentInstance),rows=events.filter(e=>e.documentInstance===documentInstance);
          return {documentInstance,htmlSha256:document.htmlSha256,servedAt:document.servedAt,
            sequenceContinuous:rows[0]?.type==='ready'&&rows.every(e=>e.sequenceContinuous&&e.firstIsReady),
            submitCount:rows.filter(e=>e.type==='submit').length,
            matchingSubmitCount:rows.filter(e=>e.type==='submit'&&e.name===input.name).length,
            events:rows.map(e=>({eventSeq:e.eventSeq,receiveSeq:e.receiveSeq,type:e.type,
              at:e.at,receivedAt:e.receivedAt,sequenceContinuous:e.sequenceContinuous,firstIsReady:e.firstIsReady,
              matchesName:e.name===input.name,...(e.name===input.name?{
                done:e.done===expectedDone?e.done:null,
                completionRedacted:e.done!==null&&e.done!==expectedDone,
              }:{})})),
          };
        });
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff'});
        res.end(JSON.stringify({sessionId,task:taskIdentity,proofLevel:'PASSIVE_ONLY',
          nativeIdentity:'NOT_OBSERVED',documents:selected}));return;
      }
      if(req.url==='/__opendesk_cloud_proof'){
        if(req.method!=='POST')return reply(405);
        if(req.headers.origin!==origin)return reply(403);
        let bytes=0;const chunks=[];
        for await(const chunk of req){
          bytes+=chunk.length;
          if(bytes>4096)return reply(413);
          chunks.push(chunk);
        }
        let row;
        try{row=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400);}
        if(!row||Array.isArray(row)||Object.keys(row).length!==keys.length||
          keys.some(key=>!Object.hasOwn(row,key))||row.sessionId!==sessionId||
          !uuid(row.documentInstance)||!documents.has(row.documentInstance)||
          !Number.isSafeInteger(row.eventSeq)||row.eventSeq<1||row.eventSeq>4096||
          !['ready','submit','done'].includes(row.type)||row.url!==url||
          typeof row.name!=='string'||row.name.length>40||
          !(row.done===null||typeof row.done==='string'&&row.done.length<=128)||
          typeof row.at!=='string'||row.at.length>32||!Number.isFinite(Date.parse(row.at)))return reply(400);
        if(receiveSeq>=4096)return reply(429);
        await enqueue(async()=>{
          if(receiveSeq>=4096)throw Error('PROOF_EVENT_LIMIT');
          const document=documents.get(row.documentInstance);
          const sequenceContinuous=row.eventSeq===document.nextEventSeq;
          const firstIsReady=document.nextEventSeq!==1||row.type==='ready';
          const saved={...row,receiveSeq:++receiveSeq,receivedAt:new Date().toISOString(),
            sequenceContinuous,firstIsReady};
          await persist(path.join(directory,'events.jsonl'),saved,{append:true});
          events.push(saved);
          document.nextEventSeq=Math.max(document.nextEventSeq,row.eventSeq+1);
        });
        return reply(204);
      }
      if(!['GET','HEAD'].includes(req.method))return reply(405);
      if(req.method==='GET'&&req.url==='/'){
        const receivedAt=new Date().toISOString();
        // This is an HTTP arrival journal, not a browser/SW reload receipt.
        // Never read headers or copy the caller's URL, query or fragment.
        const pending=rootQueue.then(async()=>{
          if(rootFailure||rootRequestSeq>=4096)throw Error('ROOT_OBSERVATION_UNAVAILABLE');
          const requestSeq=rootRequestSeq+1;
          await persist(path.join(directory,'root-requests.jsonl'),
            {path:'/',receivedAt,requestSeq},{append:true});
          rootRequestSeq=requestSeq;
        });
        rootQueue=pending.catch(error=>{rootFailure=error;});
        await pending;
      }
      if(req.url==='/'){
        // A normal document for the fixed root shortcut. No observer, scripts,
        // redirects, account fragment handling or Cloud effects belong here.
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
          'Content-Length':Buffer.byteLength(rootDocument),'X-Content-Type-Options':'nosniff',
          'Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
        res.end(req.method==='HEAD'?undefined:rootDocument);return;
      }
      if(viewerFiles.has(req.url)){
        const [name,type]=viewerFiles.get(req.url);
        const bytes=await readFile(path.join(root,'examples/cloud-control/mac24dev-demo',name));
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
        res.end(req.method==='HEAD'?undefined:bytes);return;
      }
      if(req.url==='/demo-form.html'){
        if(documents.size>=128)return reply(429);
        const documentInstance=randomUUID(),config={sessionId,documentInstance};
        const script=observerSource+'('+JSON.stringify(config)+');';
        const html=original.replace('</body>','<script data-opendesk-proof="'+documentInstance+'">'+script+'</script></body>');
        await enqueue(async()=>{
          await writeFile(path.join(directory,'documents',documentInstance+'.html'),html,{flag:'wx',mode:0o600});
          const metadata={sessionId,documentInstance,url,servedAt:new Date().toISOString(),
            htmlSha256:sha(html),observerSha256:sha(observerSource),method:req.method};
          await persist(path.join(directory,'documents.jsonl'),metadata,{append:true});
          documents.set(documentInstance,{nextEventSeq:1,...metadata});
        });
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:html);return;
      }
      // Preserve ordinary fixture files/Task downloads. Never expose the
      // evidence directory, directory listings, symlinks or parent paths.
      let pathname;
      try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{return reply(404);}
      if(!/^\/[A-Za-z0-9._/-]+$/.test(pathname)||
        pathname.split('/').some(part=>part==='..'||part.startsWith('.')))return reply(404);
      const file=await realpath(path.join(staticRoot,pathname.slice(1))).catch(()=>null);
      if(!file||!file.startsWith(staticRoot+path.sep)||(await stat(file)).isDirectory())return reply(404);
      const bytes=await readFile(file);
      const type={'.html':'text/html; charset=utf-8','.json':'application/json',
        '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:bytes);
    })().catch(()=>{if(!res.headersSent)reply(503);else res.destroy();});
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(port,'127.0.0.1',resolve);
  });
  origin='http://127.0.0.1:'+server.address().port;url=origin+'/demo-form.html';
  try{
    await persist(path.join(directory,'session.json'),{
      sessionId,startedAt:new Date().toISOString(),url,pid:process.pid,
      source:'tests/cloud-control/native-double-task.mjs fixture(effects)',
      originalPageSha256:sha(original),observerSha256:sha(observerSource),
      task:taskIdentity,
      rootRequestLog:{file:'root-requests.jsonl',path:'/',methods:['GET'],
        fields:['path','receivedAt','requestSeq'],maxEntries:4096,evidence:'HTTP_REQUEST_ONLY'},
      rootDocument:{path:'/',htmlSha256:sha(rootDocument)},
      nativeIdentity:'NOT_OBSERVED',execution:'NOT_TESTED',
      note:'Passive page evidence only; native document/Run/Result/receipt correlation is still required.',
    });
  }catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
  return {url,sessionId,directory,async close(){
    await new Promise(resolve=>server.close(resolve));
    await writeQueue;await rootQueue;
    if(failure)throw failure;
    if(rootFailure)throw rootFailure;
  }};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2];
  if(!directory)throw Error('Usage: node tests/cloud-control/passive-form-proof.mjs <fresh-evidence-directory>');
  const fixture=await startPassiveFormProof({directory});
  console.log(JSON.stringify({ready:true,...fixture,close:undefined}));
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
    if(closing)return;closing=true;
    try{await fixture.close();process.exitCode=0;}catch{process.exitCode=1;}
  });
}
