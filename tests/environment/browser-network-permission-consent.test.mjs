import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {permissionPattern} from '../../src/environment.js';
import {BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';

const uiSource=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const start=uiSource.indexOf('const confirmAction=async event=>{');
assert.notEqual(start,-1);
const end=uiSource.indexOf('\n          };',start);
assert.notEqual(end,-1);
const confirmSource=uiSource.slice(start+'const confirmAction='.length,end)+'\n}';

const approvalMarker="button:'允许本次操作',run:confirmAction}).catch(";
const approvalStart=uiSource.indexOf(approvalMarker)+approvalMarker.length;
assert.ok(approvalStart>=approvalMarker.length);
const approvalEnd=uiSource.indexOf('\n            });',approvalStart);
assert.notEqual(approvalEnd,-1);
const approvalFailure=operation=>Function('operation','return ('+uiSource.slice(approvalStart,approvalEnd)+'\n})')(operation);

test('only the pre-RPC approval boundary reports HTTP not submitted; other browser actions retain their errors',()=>{
  for(const code of ['E_CANCELLED','E_CHROME_PERMISSION_REQUIRED','E_TOOL_CHANGED']){
    const original=Object.assign(Error(),{code});
    assert.throws(()=>approvalFailure('browser.network.request')(original),{code:'E_NETWORK_NOT_SUBMITTED'});
    assert.throws(()=>approvalFailure('browser.tabs.create')(original),error=>error===original);
  }
});

const errorCode=code=>error=>error?.code===code;
async function fixture(t){
  const seen=[];
  const server=createServer((request,response)=>{
    seen.push({url:request.url,headers:request.headers});
    response.writeHead(200,{'content-type':'application/json','set-cookie':'private=secret',
      'x-server-private':'not part of the public response'});
    response.end('{"ok":true}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
  const origin='http://127.0.0.1:'+server.address().port;
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',
    id:'network-header-probe',version:'1.0.0',title:'Network header probe',description:'Test only',
    capabilities:['network'],html:'<main>probe</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
  const extensionId='a'.repeat(32),hostInstanceId=randomUUID();
  const identity={toolId:tool.id,toolVersion:tool.version,toolInstance:randomUUID(),
    hostInstanceId,installEpoch:null,packageHash:await sidebarToolPackageHash(tool)};
  const sender={id:extensionId,frameId:0,documentId:'network-header-host',documentLifecycle:'active',
    url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+hostInstanceId};
  const local=new Map([[SIDEBAR_TOOL_STORE,[tool]]]),session=new Map();
  const storage=map=>({
    get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(key=>[key,structuredClone(map.get(key))])),
    set:async values=>{for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value))}
  });
  let permitted=false,approvalRef;
  const messages=[],requests=[];
  let grant=true,clickActive=false;
  const api={runtime:{id:extensionId,getURL:path=>'chrome-extension://'+extensionId+'/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
      documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:storage(local),session:storage(session),onChanged:{addListener(){}}},
    permissions:{request:request=>{
      assert.equal(clickActive,true,'permission request must start before leaving the trusted click stack');
      requests.push(structuredClone(request));
      return Promise.resolve(grant).then(value=>{permitted=value;return value});
    },contains:async({origins})=>permitted&&(!origins||origins.every(value=>value==='http://127.0.0.1/*'))}};
  // Real installed Host and NetworkService, using native fetch to the local server.
  const host=createContextMenuHost({api,lockManager:{request:(_key,work)=>work()},logger:{warn(){}}});
  const call=args=>host.handleTool(structuredClone({operation:'browser.network.request',args,
    ...identity,...(approvalRef?{approvalRef}:{})}),sender).then(structuredClone);
  const sdk=createBrowserSdk({request:(operation,args)=>{
    assert.equal(operation,'browser.network.request');return call(args);
  }});
  api.runtime.sendMessage=async message=>{
    messages.push(message);
    try{return {ok:true,data:await host.handleHost(structuredClone(message),sender)}}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}}}
  };
  // Execute the actual lexical click handler without exporting private UI internals.
  const confirm=Function('api','operation','payload','assertSession','source','token',
    'BROWSER_HOST_PROTOCOL','tool','revocationEpoch','packageHash','hostInstanceId','permissionPattern',
    'return ('+confirmSource+')');
  const approve=(args,event={isTrusted:true})=>{
    const action=confirm(api,'browser.network.request',args,()=>{},null,identity.toolInstance,
      BROWSER_HOST_PROTOCOL,tool,null,identity.packageHash,hostInstanceId,permissionPattern);
    clickActive=true;
    try{return action(event).then(value=>{approvalRef=value;return value})}
    finally{clickActive=false}
  };
  return {sdk,call,seen,local,origin,requests,messages,approve,
    setGrant:value=>{grant=value},setSite:value=>{permitted=value},
  };
}

test('denied Chrome origin consent prevents Host approval and HTTP dispatch',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  f.setGrant(false);
  await assert.rejects(f.approve(args),errorCode('E_CHROME_PERMISSION_REQUIRED'));
  assert.deepEqual(f.requests,[{origins:['http://127.0.0.1/*']}]);
  assert.equal(f.messages.length,0);
  assert.equal(f.seen.length,0);
});

test('synthetic and missing click events cannot request Chrome origins or dispatch',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  for(const event of [{isTrusted:false},null])
    await assert.rejects(f.approve(args,event),errorCode('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.requests.length,0);
  assert.equal(f.messages.length,0);
  assert.equal(f.seen.length,0);
});

test('trusted origin consent enables the existing scoped SDK fetch with one-use approval',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  await f.approve(args);
  assert.deepEqual(f.requests,[{origins:['http://127.0.0.1/*']}]);
  assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].targetArgs.url,args.url);
  assert.deepEqual(await f.sdk.network.request(args),{status:200,data:{ok:true}});
  await assert.rejects(f.sdk.network.request(args),errorCode('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.seen.length,1);
});

test('portless Chrome permission does not expand the exact-port one-use Host approval',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  await f.approve(args);
  const changed=new URL(args.url);changed.port=String(Number(changed.port)===65535?65534:Number(changed.port)+1);
  await assert.rejects(f.sdk.network.request({...args,url:changed.href}),errorCode('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.seen.length,0);
});

test('Chrome origin revocation after confirmation still prevents HTTP dispatch',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  await f.approve(args);f.setSite(false);
  await assert.rejects(f.sdk.network.request(args),errorCode('E_SITE_PERMISSION_REVOKED'));
  assert.equal(f.seen.length,0);
});
