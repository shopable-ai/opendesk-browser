// Local development only. Separate member credentials and trusted synthetic
// consumers live in this Node process, never in React or the Vite config API.
import {request as httpRequest,createServer as createHttpServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,copyFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {TeamAccountStore} from '../../ai-account-usage/team-account-store.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
import {createCookieTeamAccounts} from '../../app/domain/team-accounts.js';
import {createTeamTrustedRuntime} from '../../tests/fixtures/team-trusted-runtime.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const fail=code=>Object.assign(Error(code),{code});
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
export async function startTeamPreview({port=43136}={}){
  const directory=await mkdtemp(join(tmpdir(),'cookie-team-core-'));
  let backend,vite,previewHttp,runtime,closed=false;
  const audit=[],clients={},invites=new Map();let seeded=false;
  const close=async()=>{if(closed)return;closed=true;
    try{await vite?.close();}finally{
      try{if(previewHttp){previewHttp.closeAllConnections();await new Promise(resolve=>previewHttp.close(resolve));}}
      finally{try{await backend?.close();}finally{try{await runtime?.close();}finally{await rm(directory,{recursive:true,force:true});}}}
    }
  };
  try{
    const assets=join(directory,'assets');await mkdir(assets,{mode:0o700});
    // This is only the changed management web UI, built into a private temporary
    // directory. No Browser output, watcher, official package or global state.
    await build({entryPoints:[join(root,'../../ai-account-usage/web/main.jsx')],bundle:true,minify:true,jsx:'automatic',
      outfile:join(assets,'app.js'),define:{__OD_PREVIEW__:'false','process.env.NODE_ENV':'"production"'},
      plugins:[{name:'no-demo-data',setup(b){b.onResolve({filter:/^\.\/demo-data\.mjs$/},()=>({path:'disabled',namespace:'disabled'}));
        b.onLoad({filter:/.*/,namespace:'disabled'},()=>({contents:"export const DEMO_DATA_LABEL='';export function createDemoApi(){throw Error('PREVIEW_DISABLED')}"}));}}]});
    await copyFile(join(root,'../../ai-account-usage/web/index.html'),join(assets,'index.html'));
    const history=new HistoryStore({directory:join(directory,'history')});
    const bindingStore=new ServiceBindingStore({directory:join(directory,'bindings')});
    const teamStore=new TeamAccountStore({directory:join(directory,'team')});
    backend=await startManagementServer({store:history,bindingStore,teamStore,assetsDirectory:assets,
      service:{query:async()=>{throw fail('E_UPSTREAM_FORBIDDEN');}}});
    const origin=new URL(backend.url).origin;
    const req=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
      const r=httpRequest({hostname:'127.0.0.1',port:new URL(origin).port,path,method,agent:false,
        headers:{host:new URL(origin).host,...headers,...(body===undefined?{}:{'content-type':'application/json'})}},res=>{
        let text='';res.on('data',part=>{text+=part;if(text.length>1024*1024)r.destroy(fail('E_PREVIEW_SIZE'));});
        res.on('end',()=>{try{const data=JSON.parse(text);resolve({status:res.statusCode,data,headers:res.headers});}catch{reject(fail('E_PREVIEW_RESPONSE'));}});
      });r.on('error',reject);r.setTimeout(12000,()=>r.destroy(fail('E_PREVIEW_TIMEOUT')));r.end(body===undefined?undefined:JSON.stringify(body));
    });
    const adminSession=await req('/session',{method:'POST',headers:{origin},body:{code:backend.pairingCode}});
    const adminHeaders={origin,cookie:adminSession.headers['set-cookie'][0].split(';')[0]};
    const admin=async(path,body)=>{
      const result=await req('/opendesk/admin/api/'+path,{method:body?'POST':'GET',body,headers:adminHeaders});
      if(result.status!==200)throw Object.assign(fail(result.data.error||'E_TEAM_HTTP'),{status:result.status});
      audit.push({actor:'admin',path,status:result.status});return result.data;
    };
    runtime=await createTeamTrustedRuntime({directory:join(directory,'trusted')});
    for(const key of ['A','B']){
      const grant=await admin('client-pairing',{memberId:'synthetic_member_'+key});
      const paired=await req('/opendesk/client/pair',{method:'POST',headers:{origin},body:{code:grant.code,
        connectionId:'synthetic_'+key,label:'合成成员 '+key,operationId:randomUUID(),receiptKey:randomBytes(32).toString('hex')}});
      if(paired.status!==200)throw fail('E_PREVIEW_PAIR');
      const auth=paired.data;let saved;
      const journalPath=join(directory,'journal-'+key+'.json');
      const journal={read:async()=>{try{return JSON.parse(await readFile(journalPath,'utf8'));}catch(error){if(error.code==='ENOENT')return undefined;throw error;}},
        write:async value=>{saved=structuredClone(value);await writeFile(journalPath,JSON.stringify(saved),{mode:0o600});}};
      const wire=async(method,path,body)=>{
        const result=await req('/opendesk/client/request',{method:'POST',headers:{origin},body:{session:auth.session,method,path,...(body===undefined?{}:{body})}});
        audit.push({actor:key,method,path,status:result.status});
        if(result.status!==200)throw Object.assign(fail(result.data.error||'E_TEAM_HTTP'),{status:result.status,
          teamRejected:[400,401,403,404,409,410].includes(result.status)&&['BAD_INPUT','TRUSTED_SESSION_REQUIRED','DEVICE_REVOKED','DEVICE_REQUIRED',
            'NOT_FOUND','ASSIGNMENT_REQUIRED','ACCOUNT_EXPIRED','VERSION_CONFLICT','EPOCH_CONFLICT','ASSIGNMENT_CONFLICT','TARGET_REJECTED','FINGERPRINT_REQUIRED'].includes(result.data.error)});return result.data;
      };
      const consumer=runtime.members[key];
      clients[key]={auth,wire,journal,consumer,make:()=>createCookieTeamAccounts({wire,account:(name,payload)=>consumer.dispatch(name,payload),scope:()=>consumer.scope(),journal})};
      clients[key].client=clients[key].make();
    }
    const seed=async()=>{
      if(seeded)throw fail('E_PREVIEW_ALREADY_PUBLISHED');seeded=true;
      for(const [id,name,value] of [['one','合成运营账号','synthetic-operations'],['two','合成设计账号','synthetic-design']]){
        const source=await runtime.sender.createSource(name,value);
        const invitation=await runtime.publishSource(source);
        const scope=await runtime.members.A.scope();
        await admin('team-accounts',{operationId:randomUUID(),accountId:id,expectedVersion:0,displayName:name,origin:scope.origin,expiresAt:Date.now()+3600000});
        await admin('team-assignments',{operationId:randomUUID(),accountId:id,accountVersion:1,deviceId:clients.A.auth.device.deviceId,
          expectedRevision:0,inviteUrl:invitation.url,senderFingerprint:null});
        invites.set(id,{invitation,source});
      }
      return {published:2,assignedMember:'synthetic_member_A',source:'SYNTHETIC'};
    };
    const deliver=async id=>{
      const item=invites.get(id);if(!item)throw fail('E_PREVIEW_ACCOUNT');
      const result=await runtime.deliver(item.invitation,runtime.members.A);
      const list=await admin('team-accounts'),assignment=list.assignments.find(row=>row.accountId===id&&row.deviceId===clients.A.auth.device.deviceId);
      await admin('team-assignments',{operationId:randomUUID(),accountId:id,accountVersion:1,deviceId:assignment.deviceId,
        expectedRevision:assignment.assignmentRevision,inviteUrl:item.invitation.url,senderFingerprint:result.senderFingerprint});
      return {status:'DELIVERED',accountId:id};
    };
    const revoke=async id=>{
      const data=await admin('team-accounts'),a=data.assignments.find(row=>row.accountId===id&&row.deviceId===clients.A.auth.device.deviceId);
      if(!a||a.revoked)throw fail('E_PREVIEW_ACCOUNT');
      return admin('team-revoke',{operationId:randomUUID(),accountId:id,deviceId:a.deviceId,expectedRevision:a.assignmentRevision});
    };
    const rpc='/__cookie-team/'+randomBytes(24).toString('hex');let previewOrigin;
    const middleware=async(req,res,next)=>{
      if(!req.url?.startsWith('/__cookie-team'))return next();
      if(req.headers.host!==new URL(previewOrigin).host||req.headers.origin&&req.headers.origin!==previewOrigin||
        req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return send(res,403,{error:'E_PREVIEW_ORIGIN'});
      if(req.url==='/__cookie-team/config'&&req.method==='GET')return send(res,200,{rpc,origin,mode:'SYNTHETIC_TRUSTED_DRIVER'});
      if(req.url!==rpc||req.method!=='POST'||req.headers['content-type']!=='application/json')return send(res,404,{error:'E_PREVIEW_ROUTE'});
      try{
        let text='';for await(const part of req){text+=part;if(text.length>4096)throw fail('E_PREVIEW_SIZE');}
        const input=JSON.parse(text);
        if(Object.keys(input).sort().join(',')!=='action,argument,member'||!['A','B'].includes(input.member)||
          input.argument!==null&&(typeof input.argument!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(input.argument)))throw fail('E_PREVIEW_INPUT');
        let value;
        if(input.action==='seed')value=await seed();
        else if(input.action==='deliver')value=await deliver(input.argument);
        else if(input.action==='revoke')value=await revoke(input.argument);
        else if(input.action==='inspect')value={members:{A:runtime.members.A.inspect(),B:runtime.members.B.inspect()},audit};
        else if(['list','pair','receive','review','use','reconcile'].includes(input.action))value=await clients[input.member].client[input.action](input.argument);
        else throw fail('E_PREVIEW_ACTION');
        send(res,200,value);
      }catch(error){send(res,400,{error:/^E_[A-Z_]+$/.test(error.code??'')?error.code:'E_PREVIEW_REQUEST'});}
    };
    const {createServer}=await import('vite');
    // Own the HTTP lifecycle. Vite's standalone signal handler exits before
    // sibling private services can finish cleanup, so use its middleware mode.
    previewHttp=createHttpServer((req,res)=>vite.middlewares(req,res));
    vite=await createServer({configFile:join(root,'vite.config.mjs'),server:{middlewareMode:true,hmr:{server:previewHttp}},
      plugins:[{name:'cookie-team-synthetic-only',configureServer(server){server.middlewares.use(middleware);}}]});
    await new Promise((resolve,reject)=>{previewHttp.once('error',reject);previewHttp.listen(port,'127.0.0.1',resolve);});
    previewOrigin='http://127.0.0.1:'+previewHttp.address().port;
    const launchFile=join(directory,'launch.json');
    // Only the local test driver may install this synthetic management cookie.
    // It never enters the config API, React state, logs or evidence.
    await writeFile(launchFile,JSON.stringify({origin,previewOrigin,adminCookie:adminHeaders.cookie}),{mode:0o600});
    return {url:previewOrigin+'/dev.html?teamCore=1',origin,previewOrigin,rpc,launchFile,close,seed,deliver,revoke,clients,runtime,admin,
      inspect:()=>({mode:'SYNTHETIC_TRUSTED_DRIVER',audit:structuredClone(audit),members:{A:runtime.members.A.inspect(),B:runtime.members.B.inspect()}})};
  }catch(error){await close();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const harness=await startTeamPreview({port:Number(process.env.COOKIE_TEAM_PREVIEW_PORT||43136)});
  process.stdout.write(JSON.stringify({url:harness.url,backendOrigin:harness.origin,launchFile:harness.launchFile,mode:'SYNTHETIC_TRUSTED_DRIVER'})+'\n');
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void harness.close().then(()=>process.exit(0));});
}
