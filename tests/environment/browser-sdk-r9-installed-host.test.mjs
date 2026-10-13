import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {validateSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const uid='01234567-89ab-4def-8123-456789abcdef';
const origin='https://shop.example.test';
const url=origin+'/account';
const partitionKey={topLevelSite:origin,hasCrossSiteAncestor:false};
const reject=code=>err=>err?.code===code;
const cookiePkg=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id:'cookie-editor',version:'2.0.0',
  title:'Cookie Editor',description:'Installed Browser Cookies SDK test fixture',
  capabilities:['currentPage.read','user.export','browser.cookies.read','browser.cookies.values',
    'browser.cookies.write','browser.cookies.observe','browser.cookies.clear'],
  html:'<div>Cookie Editor</div>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}
});
const identity={toolId:cookiePkg.id,toolVersion:cookiePkg.version,
  toolInstance:uid,hostInstanceId:uid,installEpoch:null,
  packageHash:await sidebarToolPackageHash(cookiePkg)};
const sender={id:'cookie-host-test',frameId:0,documentId:'host-doc',documentLifecycle:'active',
  url:'chrome-extension://cookie-host-test/ui/tool.html?hostInstanceId='+uid};

function fixture(){
  const local=new Map([['opendesk.sidebar-tools.installed.v1',[cookiePkg]]]),session=new Map();
  const onStorage=[],native=[],listeners=[];
  const tab={id:10,windowId:3,url,active:true,incognito:false,status:'complete'};
  const document={tabId:tab.id,windowId:tab.windowId,documentId:'website-document',url,origin};
  const state={hostAllowed:true,cookiesAllowed:true,activeTab:true,
    partition:{...partitionKey},
    records:[{name:'sid',value:'SECRET_TEST_ONLY',domain:'shop.example.test',path:'/',
      storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'lax'}]};
  const storage=(map,area)=>({
    get:async ids=>Object.fromEntries((Array.isArray(ids)?ids:[ids]).map(k=>[k,map.get(k)])),
    set:async values=>{
      const changes={};
      for(const [k,value] of Object.entries(values)){
        changes[k]={oldValue:map.get(k),newValue:value};map.set(k,value);
      }
      for(const callback of onStorage)callback(changes,area);
    }
  });
  const samePartition=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const candidates=(details={})=>state.records.filter(row=>
    (!details.storeId||row.storeId===details.storeId)&&samePartition(row.partitionKey,details.partitionKey)&&
    (!details.name||row.name===details.name)&&
    (!details.domain||row.domain.replace(/^\./,'')===details.domain)&&
    (!details.url||new URL(details.url).hostname===row.domain.replace(/^\./,'')&&
      (new URL(details.url).pathname===row.path||
       new URL(details.url).pathname.startsWith(row.path.endsWith('/')?row.path:row.path+'/'))));
  const api={
    runtime:{id:'cookie-host-test',getURL:part=>'chrome-extension://cookie-host-test/'+part,lastError:null},
    permissions:{contains:async ({permissions,origins})=>
      permissions?state.cookiesAllowed:state.hostAllowed&&origins.length===1&&
        origins[0]==='https://shop.example.test/*'},
    storage:{local:storage(local,'local'),session:storage(session,'session'),
      onChanged:{addListener:fn=>onStorage.push(fn)}},
    tabs:{query:async()=>state.activeTab?[tab]:[]},
    webNavigation:{getFrame:async()=>({url:tab.url,documentId:document.documentId,documentLifecycle:'active'})},
    cookies:{
      onChanged:{addListener:fn=>listeners.push(fn)},
      getAllCookieStores:callback=>{native.push('getAllCookieStores');callback([{id:'0',tabIds:[10],incognito:false}]);},
      getPartitionKey:(_args,callback)=>{native.push('getPartitionKey');callback({partitionKey:state.partition});},
      getAll:(args,callback)=>{native.push('getAll');callback(candidates(args).map(x=>({...x})));},
      get:(args,callback)=>{native.push('get');callback(candidates(args)[0]??null);},
      set:(args,callback)=>{
        native.push('set');
        const result={name:args.name,value:args.value,domain:args.domain??new URL(args.url).hostname,
          path:args.path??'/',storeId:args.storeId??'0',hostOnly:args.domain===undefined,
          session:args.expirationDate===undefined,secure:args.secure===true,httpOnly:args.httpOnly===true,
          sameSite:args.sameSite??'unspecified',...(args.partitionKey?{partitionKey:args.partitionKey}:{})};
        state.records=state.records.filter(x=>x.name!==result.name||x.domain!==result.domain||
          x.path!==result.path||x.storeId!==result.storeId||!samePartition(x.partitionKey,result.partitionKey));
        state.records.push(result);callback(result);
      },
      remove:(args,callback)=>{
        native.push('remove');
        const row=candidates(args)[0];
        if(row)state.records.splice(state.records.indexOf(row),1);
        callback(row?{name:row.name,url:args.url,storeId:row.storeId}:null);
      }
    }
  };
  const locks={request:(_key,work)=>work()};
  const host=createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});
  const grant=(capability,enabled=true)=>host.handleHost({
    operation:'browser.cookies.userGrant',...identity,cookieCapability:capability,enabled,
    origin,...(enabled?{document}:{})},sender);
  const confirm=(operation,args)=>host.handleHost({operation:'browser.intent.confirm',
    ...identity,targetOperation:operation,targetArgs:args},sender);
  const call=(operation,args={},approvalRef,as=identity)=>host.handleTool({
    ...as,operation,args,...(approvalRef?{approvalRef}:{})},sender);
  return {api,host,grant,call,confirm,state,native,local,document,sender,identity};
}

test('R9 actual Browser Dispatcher refuses a regular installed Cookie read before per-site grant',async()=>{
  const f=fixture(),args={url};
  await assert.rejects(f.call('browser.cookies.getAll',args),reject('E_SITE_GRANT_REQUIRED'));
  assert.equal(f.native.filter(x=>x==='getAll').length,0,'No native secret read on denied grant');
  await f.grant('read');
  const rows=await f.call('browser.cookies.getAll',args);
  assert.equal(rows.length,1);
  assert.equal(rows[0].valueRedacted,true);
  assert(!JSON.stringify(rows).includes('SECRET_TEST_ONLY'));
  f.state.activeTab=false;
  assert.equal((await f.call('browser.cookies.getAll',args)).length,1,
    'already-authorized site does not need to remain the active tab');
});

test('R9 exact Chrome host/values permissions, version, hash and extension sender are enforced',async()=>{
  const f=fixture(),args={url};
  await f.grant('read');
  await assert.rejects(f.call('browser.cookies.getAll',{...args,includeValues:true}),
    reject('E_COOKIE_VALUES_REQUIRED'));
  await f.grant('values');
  const rows=await f.call('browser.cookies.getAll',{...args,includeValues:true});
  assert.equal(rows[0].value,'SECRET_TEST_ONLY');
  f.state.hostAllowed=false;
  await assert.rejects(f.call('browser.cookies.getAll',args),reject('E_SITE_PERMISSION_REVOKED'));
  f.state.hostAllowed=true;
  await assert.rejects(f.call('browser.cookies.getAll',args,undefined,
    {...f.identity,packageHash:'0'.repeat(64)}),reject('E_TOOL_CHANGED'));
  await assert.rejects(f.host.handleTool({operation:'browser.cookies.getAll',args,...f.identity},
    {...f.sender,url:'https://attacker.example/'}),reject('E_OWNER'));
  await f.grant('values',false);
  await assert.rejects(f.call('browser.cookies.getAll',{...args,includeValues:true}),
    reject('E_COOKIE_VALUES_REQUIRED'));
});

test('R9 Chrome Cookie native effect requires one-use reviewed intent and respects revocation',async()=>{
  const f=fixture(),args={url,name:'theme',value:'test',path:'/'};
  await f.grant('write');
  await assert.rejects(f.call('browser.cookies.set',args),reject('E_USER_GESTURE_REQUIRED'));
  const approval=(await f.confirm('browser.cookies.set',args)).approvalRef;
  assert.equal((await f.call('browser.cookies.set',args,approval)).saved,true);
  assert.equal(f.native.filter(x=>x==='set').length,1);
  await assert.rejects(f.call('browser.cookies.set',args,approval),reject('E_USER_GESTURE_REQUIRED'));
  const pending=(await f.confirm('browser.cookies.set',{...args,value:'new'})).approvalRef;
  await f.grant('write',false);
  await assert.rejects(f.call('browser.cookies.set',{...args,value:'new'},pending),
    reject('E_GRANT_REVOKED'));
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

test('R9 uninstalled and disabled Cookie tools cannot reuse previously granted site capability',async()=>{
  const f=fixture();
  await f.grant('read');
  await f.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_TOOL_CHANGED'));
});


test('R9 revoking an entire Cookie website is atomic even without the tab open',async()=>{
  const f=fixture();
  await f.grant('read');await f.grant('write');await f.grant('values');
  f.state.activeTab=false;
  await f.grant('all',false);
  for(const cap of ['read','values','write','observe','clear']){
    const grant=f.local.get('opendesk.browser.context-menu-grants.v1')?.[f.identity.toolId]?.cookieSites?.[origin];
    assert.equal(grant?.[cap],false,cap);
  }
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_SITE_GRANT_REQUIRED'));
  await assert.rejects(f.call('browser.cookies.set',{url,name:'x',value:'x'}),
    reject('E_USER_GESTURE_REQUIRED'));
  await assert.rejects(f.grant('all',true),reject('E_SCHEMA'),
    'A sandbox or trusted UI must never bulk-enable all Cookie permissions');
});
test('R9 a later values/write grant cannot silently move an earlier read grant to another partition',async()=>{
  const f=fixture();
  await f.grant('read');
  f.state.partition={topLevelSite:'https://other.example.test',hasCrossSiteAncestor:false};
  await assert.rejects(f.grant('values'),reject('E_COOKIE_SCOPE'));
  await assert.rejects(f.grant('write'),reject('E_COOKIE_SCOPE'));
  assert.notEqual(f.local.get('opendesk.browser.context-menu-grants.v1')?.[f.identity.toolId]?.cookieSites?.[origin]?.write,true);
});
