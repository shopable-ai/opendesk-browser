// Read-only diagnostics: never kills or restarts a process, changes permissions,
// rewrites dist, or touches Chrome profiles. Run from any cwd: node scripts/diagnose-local-runtime.mjs
import {execFileSync} from 'node:child_process';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(bin,args)=>{try{return execFileSync(bin,args,{cwd:root,encoding:'utf8',timeout:3000}).trim();}catch{return null;}};
async function read(relative){try{return await readFile(join(root,relative));}catch{return null;}}
async function service(port){
  const result={port,listening:[],page:null};
  const listing=run('lsof',['-nP','-sTCP:LISTEN','-iTCP:'+port,'-Fpc']);
  if(listing!==null){
    let row;
    for(const line of listing.split('\n')){
      if(line.startsWith('p')){row={pid:Number(line.slice(1))};result.listening.push(row);}
      else if(row && line.startsWith('c'))row.command=line.slice(1);
    }
    for(const entry of result.listening){
      const cwd=run('lsof',['-nP','-a','-p',String(entry.pid),'-d','cwd','-Fn']);
      entry.cwd=cwd?.split('\n').find(line=>line.startsWith('n'))?.slice(1)||null;
      entry.startedAt=run('ps',['-p',String(entry.pid),'-o','lstart=']);
    }
  }else result.listenerInspection='lsof unavailable or no matching TCP LISTEN socket';
  if(port===43111||port===43112){
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/demo-form.html?opendesk-diagnostic=1',
        {cache:'no-store',signal:AbortSignal.timeout(2000)});
      const bytes=Buffer.from(await response.arrayBuffer()),html=bytes.toString('utf8');
      result.page={status:response.status,sha256:hash(bytes),bytes:bytes.length,
        legacyManualSdkHint:html.includes('需要安装当前网页的 OpenDesk SDK')||
          html.includes('明确批准此快照并安装 SDK'),
        newSdkAutoloadHint:html.includes('SDK 默认自动安装，无需进入设置批准'),
        url:response.url};
    }catch(error){result.page={error:error.cause?.code||error.code||error.name||'HTTP_UNAVAILABLE',message:error.message};}
  }
  return result;
}
async function main(){
  const real=await realpath(root),source=await read('examples/tasks/demo-form.html');
  const record={schemaVersion:1,tool:'opendesk-local-runtime-readonly',repoRoot:real,
    branch:run('git',['branch','--show-current']),
    head:run('git',['rev-parse','HEAD']),remoteTrackingMain:run('git',['rev-parse','refs/remotes/origin/main']),
    changedTrackedFiles:run('git',['status','--porcelain=v1','--untracked-files=no']),
    node:process.version,npm:run('npm',['--version']),
    sourceHtml:source?{path:join(real,'examples/tasks/demo-form.html'),bytes:source.length,sha256:hash(source)}:null,
    dev:{},services:[]};
  for(const path of ['manifest.json','framework/sdk-main.js','agents/page-relay.js',
    'scripting/sandbox/worker-runtime.js','runtime/builtin-libraries/page-core.js',
    'runtime/builtin-libraries/manifest.json']){
    const bytes=await read('dist/development/'+path);
    record.dev[path]=bytes?{bytes:bytes.length,sha256:hash(bytes)}:{status:'MISSING'};
  }
  const manifest=await read('dist/development/manifest.json');
  if(manifest)try{const parsed=JSON.parse(manifest.toString('utf8'));
    record.extension={name:parsed.name,version:parsed.version,manifestVersion:parsed.manifest_version};
  }catch{record.extension={error:'invalid extension manifest'};}
  const marker=await read('dist/development/development-update.json');
  if(marker)try{
    const value=JSON.parse(marker.toString('utf8'));
    const changed=[];
    for(const [path,wanted] of Object.entries(value.files||{})){
      const bytes=await read('dist/development/'+path);
      if(!bytes||hash(bytes)!==wanted)changed.push(path);
    }
    record.devUpdate={revision:value.revision,files:Object.keys(value.files||{}).length,
      inconsistentOutputs:changed.slice(0,20),inconsistentCount:changed.length};
  }catch(error){record.devUpdate={error:'unreadable marker',message:error.message};}
  else record.devUpdate={status:'MISSING',hint:'npm run build:dev produces a static package; npm run dev publishes a development-update.json marker'};
  for(const port of [43111,43112,43119,43120])record.services.push(await service(port));
  record.conclusions={
    http43111MatchesSource:record.sourceHtml&&record.services[0].page?.status===200
      ? record.sourceHtml.sha256===record.services[0].page.sha256 : null,
    browserExtensionIdentity:'NOT_OBSERVABLE: inspect chrome://extensions > OpenDesk Browser > ID and unpacked path',
    next:'A valid dist hash does not prove Chrome loaded those bytes. Compare extension path in chrome://extensions and refresh an old business tab explicitly.'
  };
  console.log(JSON.stringify(record,null,2));
}
main().catch(error=>{console.error('Local runtime inspection failed:',error);process.exitCode=1;});
