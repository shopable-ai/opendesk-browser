import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {operationSchemas} from '../../src/framework/sdk/browser-schemas.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';

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
  let permitted=true,approvalRef;
  const api={runtime:{id:extensionId,getURL:path=>'chrome-extension://'+extensionId+'/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
      documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:storage(local),session:storage(session),onChanged:{addListener(){}}},
    permissions:{contains:async({origins})=>permitted&&(!origins||origins.every(value=>value==='http://127.0.0.1/*'))}};
  // Real installed Host and NetworkService, using native fetch to the local server.
  const host=createContextMenuHost({api,lockManager:{request:(_key,work)=>work()},logger:{warn(){}}});
  const call=args=>host.handleTool(structuredClone({operation:'browser.network.request',args,
    ...identity,...(approvalRef?{approvalRef}:{})}),sender).then(structuredClone);
  const sdk=createBrowserSdk({request:(operation,args)=>{
    assert.equal(operation,'browser.network.request');return call(args);
  }});
  return {sdk,call,seen,local,origin,setSite:value=>{permitted=value},
    approve:async args=>{
      const result=await host.handleHost(structuredClone({...identity,operation:'browser.intent.confirm',
        targetOperation:'browser.network.request',targetArgs:args}),sender);
      approvalRef=result.approvalRef;return approvalRef;
    }};
}

test('safe headers pass the public SDK, installed Host and real NetworkService HTTP transport',async t=>{
  const f=await fixture(t);
  const args={method:'GET',url:f.origin+'/membership',config:{timeout:2000,responseType:'json',
    headers:{'X-OpenDesk-Local-Test':'1',Accept:'application/json','X-Request-Id':'probe'}}};
  assert.deepEqual(normalizeBrowserOperation('browser.network.request',args).config.headers,
    {'x-opendesk-local-test':'1',accept:'application/json','x-request-id':'probe'});
  await assert.rejects(f.sdk.network.request(args),errorCode('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.seen.length,0);
  await f.approve(args);
  const result=await f.sdk.network.request(args);
  assert.deepEqual(result,{status:200,data:{ok:true}});
  assert.equal(f.seen.length,1);
  assert.equal(f.seen[0].headers['x-opendesk-local-test'],'1');
  assert.equal(f.seen[0].headers.accept,'application/json');
  assert.equal(f.seen[0].headers['x-request-id'],'probe');
  assert.equal(f.seen[0].headers.cookie,undefined);
  assert.equal(f.seen[0].headers.authorization,undefined);
  const {input,output}=operationSchemas('browser.network.request');
  assert.deepEqual(input.properties.config.properties.headers,
    {type:'object',additionalProperties:{type:'string'}});
  assert.deepEqual(Object.keys(result).sort(),Object.keys(output.properties).sort());
  assert.equal(output.additionalProperties,false);
  assert(!JSON.stringify(result).includes('private'));
});

test('sensitive or malformed headers fail in both the SDK and Host before transport',async t=>{
  const f=await fixture(t),base={method:'GET',url:f.origin+'/membership'};
  const forbidden=['Cookie','aUtHoRiZaTiOn','Origin','Host','Proxy-Authorization','Referer','Sec-Fetch-Site',
    'User-Agent','uSeR-aGeNt'];
  const unsafe=[...forbidden.map(name=>({[name]:'secret'})),
    {'X-Bad\r\nInjected':'secret'},{'X-Test':'value\r\nCookie: secret'},
    {'X-Test':1},null,[]];
  for(const headers of unsafe){
    const args={...base,config:{headers}};
    assert.throws(()=>f.sdk.network.request(args),errorCode('E_CONFIG_UNSUPPORTED'));
    await assert.rejects(f.call(args),errorCode('E_CONFIG_UNSUPPORTED'));
  }
  const large={...base,config:{headers:{'X-Test':'x'.repeat(12000)}}};
  assert.throws(()=>f.sdk.network.request(large),errorCode('E_LIMIT'));
  await assert.rejects(f.call(large),errorCode('E_LIMIT'));
  assert.equal(f.seen.length,0);
});

test('safe headers remain bound to one-use confirmation, site consent and installed identity',async t=>{
  const f=await fixture(t),args={method:'GET',url:f.origin+'/membership',
    config:{headers:{'X-Request-Id':'approved'}}};
  await f.approve(args);
  await assert.rejects(f.sdk.network.request({...args,config:{headers:{'X-Request-Id':'changed'}}}),
    errorCode('E_USER_GESTURE_REQUIRED'));
  await assert.rejects(f.sdk.network.request(args),errorCode('E_USER_GESTURE_REQUIRED'));
  await f.approve(args);f.setSite(false);
  await assert.rejects(f.sdk.network.request(args),errorCode('E_SITE_PERMISSION_REVOKED'));
  f.setSite(true);await f.approve(args);f.local.set(SIDEBAR_TOOL_STORE,[]);
  await assert.rejects(f.sdk.network.request(args),errorCode('E_TOOL_CHANGED'));
  assert.equal(f.seen.length,0);
});
