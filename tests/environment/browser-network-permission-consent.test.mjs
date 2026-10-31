import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {permissionPattern} from '../../src/environment.js';
import {BROWSER_HOST_PROTOCOL,browserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';

const uiSource=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
// Exercise the real pre-RPC permission branch, including its trusted click.
const start=uiSource.indexOf("      if(operation==='browser.network.request'){");
assert.notEqual(start,-1);
const end=uiSource.indexOf("\n      if(['browser.tabs.create'",start);
assert.notEqual(end,-1);
const prepare=Function('api','operation','payload','assertSession','source','token',
  'tool','permissionPattern','requestBrowserClick',
  'return (async()=>{'+uiSource.slice(start,end)+'})()');

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
  let permitted=false;
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
    ...identity}),sender).then(structuredClone);
  const sdk=createBrowserSdk({request:(operation,args)=>{
    assert.equal(operation,'browser.network.request');return call(args);
  }});
  api.runtime.sendMessage=async message=>{
    messages.push(message);
    try{return {ok:true,data:await host.handleHost(structuredClone(message),sender)}}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}}}
  };
  let reviews=0,current=true;
  const preflight=(args,event={isTrusted:true})=>prepare(api,'browser.network.request',args,
    ()=>{if(!current)throw Object.assign(Error(),{code:'E_TOOL_CHANGED'})},
    null,identity.toolInstance,tool,permissionPattern,async ({run})=>{
      reviews++;clickActive=true;
      try{return run(event)}finally{clickActive=false}
    });
  return {sdk,call,seen,local,origin,requests,messages,preflight,
    get reviews(){return reviews},
    setGrant:value=>{grant=value},setSite:value=>{permitted=value},
    setCurrent:value=>{current=value}
  };
}

test('ordinary HTTP is not a gesture operation; network observation still requires one',()=>{
  assert.equal(browserOperation('browser.network.request').requiresUserGesture,false);
  assert.equal(browserOperation('browser.network.observe.start').requiresUserGesture,true);
});

test('existing Chrome permission sends repeated POSTs with no trusted review or approval RPC',async t=>{
  const f=await fixture(t),args={method:'POST',url:f.origin+'/membership',data:{action:'read-cache'}};
  f.setSite(true);
  for(let i=0;i<2;i++){
    await f.preflight(args);
    assert.deepEqual(await f.sdk.network.request(args),{status:200,data:{ok:true}});
  }
  assert.equal(f.reviews,0);assert.equal(f.requests.length,0);
  assert.equal(f.messages.length,0);assert.equal(f.seen.length,2);
});

test('missing Chrome permission is requested once from the real trusted click and then reused',async t=>{
  const f=await fixture(t),args={method:'POST',url:f.origin+'/membership'};
  await f.preflight(args);
  await f.sdk.network.request(args);
  await f.preflight(args);
  await f.sdk.network.request(args);
  assert.equal(f.reviews,1);
  assert.deepEqual(f.requests,[{origins:['http://127.0.0.1/*']}]);
  assert.equal(f.messages.length,0);assert.equal(f.seen.length,2);
});

test('denied or synthetic permission prompts prove no HTTP was submitted',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  for(const event of [{isTrusted:false},null])
    await assert.rejects(f.preflight(args,event),errorCode('E_NETWORK_NOT_SUBMITTED'));
  assert.equal(f.requests.length,0);
  f.setGrant(false);
  await assert.rejects(f.preflight(args),errorCode('E_NETWORK_NOT_SUBMITTED'));
  assert.equal(f.requests.length,1);
  await assert.rejects(f.sdk.network.request(args),errorCode('E_SITE_PERMISSION_REVOKED'));
  assert.equal(f.messages.length,0);assert.equal(f.seen.length,0);
});

test('stale tool instance cannot prompt or submit HTTP',async t=>{
  const f=await fixture(t),args={method:'POST',url:f.origin+'/membership'};
  f.setCurrent(false);
  await assert.rejects(f.preflight(args),errorCode('E_NETWORK_NOT_SUBMITTED'));
  assert.equal(f.requests.length,0);assert.equal(f.reviews,0);assert.equal(f.seen.length,0);
});

test('revocation after preflight remains a dispatch error, never mislabeled as not submitted',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership'};
  await f.preflight(args);f.setSite(false);
  await assert.rejects(f.sdk.network.request(args),errorCode('E_SITE_PERMISSION_REVOKED'));
  assert.equal(f.seen.length,0);
});
