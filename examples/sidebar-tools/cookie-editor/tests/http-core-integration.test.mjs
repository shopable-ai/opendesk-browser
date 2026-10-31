import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCookieHttpServices} from '../app/domain/http-services.js';
import {HistoryStore} from '../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../ai-account-usage/web-server.mjs';
import {createNetworkService} from '../../../../src/platform/chrome/network.js';
import {normalizeBrowserOperation} from '../../../../src/framework/sdk/browser-contract.js';
import {executeBrowserToolStorage} from '../../../../src/ui/sidebar-tools/storage-state.js';

test('sandbox business controller through real SDK network/storage drivers completes ordinary HTTP core without Native or upstream',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cookie-http-core-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const asset of ['index.html','app.js','app.css'])await writeFile(join(directory,asset),'synthetic asset');
  const store=new HistoryStore({directory:join(directory,'history')});
  await store.register({alias:'acct_01',displayName:'Synthetic resource'});
  const bindingStore=new ServiceBindingStore({directory:join(directory,'bindings')});
  let upstream=0;
  const server=await startManagementServer({store,bindingStore,assetsDirectory:directory,
    service:{query:async()=>{upstream++;throw Error('UPSTREAM_FORBIDDEN');}}});
  t.after(()=>server.close());
  const origin=server.applicationPairing.origin,opened=[],networkCalls=[],phases=[];
  let losePairReply=true,revokeAfterDispatch=false;
  // Resolve the server's unique .localhost host to loopback, preserving its
  // real Host header and URL. This adapter substitutes DNS only.
  const fetchImpl=(url,options)=>new Promise((resolve,reject)=>{
    const target=new URL(url);assert.equal(target.origin,origin);
    const req=httpRequest({hostname:'127.0.0.1',port:target.port,path:target.pathname,method:options.method,
      headers:{...options.headers,host:target.host},signal:options.signal},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        if(losePairReply&&target.pathname==='/opendesk/client/pair'){losePairReply=false;reject(Error('Synthetic lost committed reply'));return;}
        resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));
      });
    });req.on('error',reject);req.end(options.body);
  });
  const network=createNetworkService({fetchImpl,authorize:async input=>{
    assert.equal(new URL(input.url).origin,origin);phases.push(input.phase);
    if(revokeAfterDispatch&&input.phase==='post'){revokeAfterDispatch=false;throw Object.assign(Error(),{code:'E_SITE_PERMISSION_REVOKED'});}
  }});
  const local=new Map(),api={storage:{local:{
    get:async key=>({[key]:structuredClone(local.get(key))}),
    set:async values=>{for(const [key,value] of Object.entries(values))local.set(key,structuredClone(value));}
  }}};
  const request=async(operation,input)=>{
    const args=normalizeBrowserOperation(operation,input);
    if(operation.startsWith('browser.storage.local.'))return executeBrowserToolStorage({api,operation,toolId:'cookie-editor',input:args,authorize:async()=>{}});
    if(operation==='browser.network.request'){networkCalls.push(structuredClone(args));return network.request(args);}
    if(operation==='browser.tabs.create'){opened.push(args.url);return {tabRef:'a'.repeat(32)};}
    throw Error('Unexpected privileged operation: '+operation);
  };
  const account={origin:'https://chatgpt.com',alias:'saved_01',version:3};
  const service=createCookieHttpServices({request,version:'2.0.58',context:async()=>({origin:account.origin,accounts:[account],storeId:'0',partitionKey:null})});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Synthetic HTTP',serviceOrigin:origin});
  const connectionId=state.connections[0].id;
  const act=async(action,payload={})=>state=await service.dispatch(action,{revision:state.revision,connectionId,...payload});
  await act('serviceConnect',{code:server.applicationPairing.code});assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
  await act('serviceReconcile');assert.equal(state.connections[0].status,'CONNECTED');
  assert.equal((await bindingStore.read()).devices.length,1);
  assert.equal(networkCalls.filter(c=>c.url.endsWith('/pair')).length,1);
  await act('serviceResources');assert.equal(state.connections[0].resources[0].remoteAccountId,'acct_01');
  await act('serviceUsage',{remoteAccountId:'acct_01'});assert.equal(state.connections[0].usageCache.acct_01.status,'UNKNOWN');
  await act('serviceBind',{alias:account.alias,accountVersion:3,remoteAccountId:'acct_01'});
  const binding=state.connections[0].bindings[0];assert.equal(binding.verificationState,'UNVERIFIED');
  revokeAfterDispatch=true;
  await act('serviceOpen',{bindingId:binding.bindingId});assert.equal(opened.length,0);
  assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
  await act('serviceArchiveOpen');assert.equal(opened.length,0);
  await act('serviceOpen',{bindingId:binding.bindingId});assert.equal(opened.length,1);
  const url=new URL(opened[0]);assert.equal(url.origin,origin);assert.equal(url.pathname,'/opendesk/admin/accounts/acct_01');
  // Administrative authority remains a separate same-origin session; the app
  // cannot save a desired policy through its client envelope.
  const admin=await fetchImpl(origin+'/session',{method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({code:server.pairingCode})});
  const adminCookie=admin.headers.get('set-cookie').split(';')[0];
  const policy=await fetchImpl(origin+'/opendesk/admin/api/sync-policy',{method:'POST',headers:{'content-type':'application/json',origin,cookie:adminCookie},
    body:JSON.stringify({deviceId:state.connections[0].deviceId,operationId:crypto.randomUUID(),expectedRevision:0,
      scope:{bindingIds:[binding.bindingId],dataCategories:['ACCOUNT_METADATA','USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:7}})});
  assert.equal(policy.status,200);
  await act('serviceReadPolicy');const p=state.connections[0].policy.desired;
  assert.equal(state.connections[0].policy.acceptance,null);
  await act('serviceAcceptPolicy',{desiredRevision:p.desiredRevision,desiredHash:p.desiredHash,
    scope:{bindingIds:[binding.bindingId],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:3}});
  assert.equal(state.connections[0].policy.status,'ACCEPTED');
  await act('serviceUnbind',{bindingId:binding.bindingId});assert.equal(state.connections[0].bindings[0].revoked,true);
  await act('serviceDisconnect');assert.equal(state.connections[0].status,'DISCONNECTED');
  assert.equal((await bindingStore.read()).devices[0].revoked,true);
  assert.equal(upstream,0);assert.ok(phases.includes('post'));
  assert.ok(networkCalls.every(c=>c.url.startsWith(origin+'/opendesk/client/')));
  assert.ok(!JSON.stringify(state).includes(server.applicationPairing.code));
});
