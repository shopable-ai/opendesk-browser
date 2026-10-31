import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {request} from 'node:http';
import {createManagedServiceProvider} from '../../../../../native-agent/managed-services/provider.mjs';
import {createManagedServiceClient} from '../../../../../src/native-agent/managed-service-client.js';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
import {createUsageNativeAdapter} from '../../ai-account-usage/native-service-adapter.mjs';

const binary=process.env.OPENDESK_MANAGED_HOST_TEST_BINARY;
const extensionId='abcdefghijklmnopabcdefghijklmnop';
const until=async predicate=>{const end=Date.now()+6000;while(!predicate()){assert.ok(Date.now()<end,'expected bounded process outcome');await new Promise(r=>setTimeout(r,10));}};
// Real Go Native frames/private authenticated socket + Node provider/backend.
// Chrome's Port/permission/installation authority is synthetic: NOT native UI.
test('real Go broker carries metadata connect/bind/policy/open and retires only its optional connector',
 {skip:!binary,timeout:20000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'usage-go-process-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const child=spawn(binary,['-test.run','^TestManagedHostProcessFixture$'],{env:{...process.env,
  OPENDESK_MANAGED_HOST_FIXTURE_ROOT:dir,OPENDESK_CODEX_HTTP_ADDR:'',OPENDESK_CODEX_HTTP_TOKEN:''},stdio:['pipe','pipe','pipe']});
 let exited=false,childError='',hello=false,buffer=Buffer.alloc(0),frameError;
 child.on('exit',()=>{exited=true;});child.stderr.on('data',b=>{childError+=b.toString();});
 const send=message=>{const bytes=Buffer.from(JSON.stringify(message)),header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);child.stdin.write(Buffer.concat([header,bytes]));};
 const port={postMessage:send};
 const client=createManagedServiceClient({api:{permissions:{contains:async()=>true}},connection:()=>({enabled:true,ready:hello,port,generation:1}),timeoutMs:6000});
 t.after(async()=>{client.dispose();child.stdin.end();await until(()=>exited);assert.equal(childError,'');});
 child.stdout.on('data',chunk=>{
  if(exited)return;
  try{
   buffer=Buffer.concat([buffer,chunk]);
   while(buffer.length>=4){const length=buffer.readUInt32LE(0);if(length>60*1024)break;if(buffer.length<length+4)break;
    const msg=JSON.parse(buffer.subarray(4,length+4));buffer=buffer.subarray(length+4);
    if(msg.kind==='hello'){assert.equal(msg.managedServicesVersion,1);hello=true;client.negotiate(msg.managedServicesVersion);
     send({v:1,kind:'welcome',extensionId,extensionVersion:'isolated-test',managedServicesVersion:1});}
    else assert.equal(client.receive(msg),true);
   }
  }catch(e){frameError=e;}
 });
 await until(()=>hello||exited);assert.equal(exited,false);
 const installation=()=>({extensionId,socketPath:join(dir,'agent.sock'),clientCredential:'a'.repeat(64)});
 // Read-only authentication probes wait for welcome processing without retrying
 // registration, a business operation or any dispatched request.
 let ready=false;
 while(!ready){ready=await new Promise((resolve,reject)=>{const socket=net.createConnection({path:installation().socketPath});let line='';
  socket.on('connect',()=>socket.write(JSON.stringify({v:1,kind:'auth',credential:installation().clientCredential})+'\n'));
  socket.on('data',b=>{line+=b;if(line.includes('\n')){socket.destroy();resolve(JSON.parse(line.split('\n')[0]).browserReady);}});socket.on('error',reject);});}
 for(const file of ['index.html','app.js','app.css'])await writeFile(join(dir,file),'fixture');
 const store=new HistoryStore({directory:join(dir,'history')});await store.register({alias:'acct_01',displayName:'Synthetic account'});
 const bindingStore=new ServiceBindingStore({directory:join(dir,'bindings')});
 const server=await startManagementServer({store,bindingStore,assetsDirectory:dir,
  service:{query:async()=>assert.fail('No upstream query is permitted')}});t.after(()=>server.close());
 const origin=new URL(server.url).origin;
 const http=(path,body,cookie)=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:new URL(origin).port,path,method:body?'POST':'GET',
  headers:{host:new URL(origin).host,...(body?{origin,'content-type':'application/json'}:{}),...(cookie?{cookie}:{})}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,
    cookie:res.headers['set-cookie']?.[0]?.split(';')[0],data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 const handler=createUsageNativeAdapter({server,store});
 const provider=createManagedServiceProvider({installation,descriptor:{serviceId:'ai-account-usage',serviceInstanceId:server.serviceBinding.serviceInstanceId,
  productName:'AI Account Usage',origin,capabilities:['usage:manual-binding','policy:metadata-state','management:resource-open']},handler,onDisconnect:()=>handler.disconnectAll()});
 t.after(()=>provider.close());await provider.start();
 await until(()=>client.state().services.length===1);
 const descriptor=client.state().services[0];assert.equal(descriptor.providerEpoch,provider.state().providerEpoch);
 const owner={extensionId,toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'synthetic_install_1'};
 const call=(action,payload={})=>client.request({serviceId:descriptor.serviceId,providerEpoch:descriptor.providerEpoch,owner,action,payload:{connectionId:'conn_1',...payload}});
 const connected=await call('connect',{operationId:'connect_1',label:'Synthetic Mac'});assert.equal(connected.status,'CONNECTED');
 assert.deepEqual((await call('accounts')).accounts.map(a=>a.remoteAccountId),['acct_01']);
 const bound=await call('bind',{operationId:'bind_1',remoteAccountId:'acct_01',localRef:{origin:'https://example.test',alias:'saved_1',version:1,storeId:'0',partitionKey:null}});
 assert.equal(bound.verificationState,'UNVERIFIED');
 const paired=await http('/session',{code:server.pairingCode});assert.equal(paired.status,200);
 const scope={bindingIds:[bound.bindingId],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7};
 assert.equal((await http('/opendesk/admin/api/sync-policy',{deviceId:connected.deviceId,operationId:'policy_1',expectedRevision:0,scope},paired.cookie)).status,200);
 const policy=await call('policy');assert.equal(policy.acceptance,null);assert.equal(policy.desired.desiredRevision,1);
 await call('accept',{operationId:'accept_1',authEpoch:connected.authEpoch,desiredRevision:policy.desired.desiredRevision,desiredHash:policy.desired.desiredHash,scope});
 assert.equal((await call('policy')).acceptance.desiredRevision,1);
 const opened=await call('open',{remoteAccountId:'acct_01',bindingId:bound.bindingId});
 assert.equal(new URL(opened.url).origin,origin);assert.equal(new URL(opened.url).pathname,'/opendesk/admin/accounts/acct_01');
 const code=new URLSearchParams(new URL(opened.url).hash.slice(1)).get('open');
 const accountSession=await http('/opendesk/open-session',{code});assert.equal(accountSession.status,200);
 assert.equal((await http('/opendesk/open-session',{code})).status,401);
 assert.equal((await http('/api/v1/accounts',undefined,accountSession.cookie)).status,200);
 assert.equal((await http('/opendesk/admin/api/devices',undefined,accountSession.cookie)).status,403);
 const deviceOpen=await call('open');assert.equal(new URL(deviceOpen.url).pathname,'/opendesk/admin/sync');assert.equal(new URL(deviceOpen.url).searchParams.get('device'),connected.deviceId);
 await call('unbind',{operationId:'unbind_1',bindingId:bound.bindingId,authEpoch:bound.authEpoch,expectedRevision:bound.revision});
 await call('disconnect',{operationId:'disconnect_1',authEpoch:connected.authEpoch+1});
 provider.close();await until(()=>client.state().services.length===0);
 const revoked=await http('/api/v1/accounts',undefined,accountSession.cookie);
 assert.equal(revoked.status,403);assert.equal(revoked.data.error,'TRUSTED_SESSION_REQUIRED');
 assert.equal((await http('/opendesk/admin/api/devices',undefined,paired.cookie)).status,200,'standalone admin remains usable after connector retirement');
 assert.equal(frameError,undefined);
});
