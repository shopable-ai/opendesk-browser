import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext,Script} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const project='examples/sidebar-tools/cookie-editor';
const get=path=>readFile(path,'utf8');
async function harness(browser=null,{currentPage=null}={}){
  const [source,html,css,config]=await Promise.all([
    get(project+'/src/main.js'),get(project+'/src/index.html'),
    get(project+'/src/style.css'),get(project+'/tool.config.json').then(JSON.parse)]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements=new Map(ids.map(id=>{
    const listeners=new Map();
    return [id,{
      id,value:'',hidden:true,disabled:false,checked:false,readOnly:false,
      addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);},
      emitTest(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},
      focus(){},append(){},replaceChildren(){},setAttribute(){},
      classList:{add(){},remove(){}}
    }];
  }));
  const root={querySelector(selector){return elements.get(selector.slice(1));},
    querySelectorAll(){return [];},addEventListener(){},
    ownerDocument:{activeElement:null,createElement:()=>({
      append(){},setAttribute(){},addEventListener(){},focus(){}
    })}};
  const marker='void refresh();\n})();';
  assert.equal(source.split(marker).length,2,'test injection bound to one stable entrypoint');
  // Test-only instrumentation: production bytes never publish internal helpers.
  const instrument=source.replace(marker,
    'globalThis.__cookieTest={normalizeCookie,parseImport,exportText,saveToList,mergeImport,'+
    'sortCookies,parseTarget,redactMetadata,readBrowserMetadata,openEditor,saveBrowserCookie,nativeInput,'+
    'setLiveTarget:url=>{liveTarget=parseTarget(url);targetPending=false;liveRows=[];liveState="idle"},'+
    'setTargetPending:value=>{targetPending=value},'+
    'liveSnapshot:()=>({rows:liveRows,state:liveState,message:liveMessage}),'+
    'render,getSiteHeading:()=>E("site-host").textContent,'+
    'getStatusMessage:()=>E("status").textContent,getField:id=>E(id),'+
    'setSite:host=>{data={hostname:host,origin:"https://"+host,cookies:[]}},'+
    'setRows:rows=>{data={...data,cookies:rows}}};\n})();');
  const fixtureBrowser=browser?.cookies?.getAll&&!browser.cookies.getPartitionKey?
    {...browser,cookies:{...browser.cookies,
      getPartitionKey:async({url})=>({partitionKey:{topLevelSite:new URL(url).origin,
        hasCrossSiteAncestor:false}})}}:browser;
  const context={
    OpenDeskTool:{root,request:async operation=>operation==='currentPage.info'&&currentPage?
      {status:'available',url:currentPage}:{status:'unavailable'},setState(){}},
    OpenDeskSDK:fixtureBrowser?{browser:fixtureBrowser}:undefined,
    Blob,Date,URL,TextEncoder,structuredClone,console
  };
  new Script(instrument,{filename:'cookie-editor-main.js'}).runInNewContext(context);
  // The initial asynchronous current-page lookup must settle before adapter assertions.
  await new Promise(resolve=>setImmediate(resolve));
  return {...context.__cookieTest,source,html,css,config,ids,
    fire:(id,type,event={})=>elements.get(id).emitTest(type,event),
    settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
const expectError=(fn,pattern)=>{
  assert.throws(fn,error=>{assert.match(String(error?.message||error),pattern);return true;});
};
test('Cookie Editor is an optional two-mode tool without private cookies API',async()=>{
  const s=await harness();
  assert.equal(s.config.id,'cookie-editor');
  assert.deepEqual([...s.config.capabilities],
    ['currentPage.read','user.export','browser.cookies.read','browser.cookies.values',
      'browser.cookies.write','browser.cookies.observe','browser.cookies.clear']);
  assert(!/request\(\s*['"]cookies\./.test(s.source));
  assert(!/browser\.cookies\.(?:approve|execute)/.test(s.source));
  assert(s.source.includes('sdk.cookies.getAll({url:target.url,'),
    'live Cookie reads must be scoped through the formal public SDK');
  assert(s.source.includes("permission?.callableNow"));
  assert(s.html.includes('id="mode-browser"')&&s.html.includes('id="mode-offline"'));
  assert(s.html.includes('id="refresh"')&&s.html.includes('id="target-url" data-sensitive="true"'));
  assert(s.html.includes('id="target-selector"')&&!s.html.includes('id="sample"'),
    'production UI must have a compact website picker and no synthetic demo loader');
  assert(!s.source.includes('example.test'),
    'no fictitious website may silently stand in for an unavailable browser page');
  assert(s.html.includes('id="browser-panel"')&&s.html.includes('id="cookie-content"'));
  assert(s.html.includes('id="live-search"')&&s.html.includes('id="live-filter"')&&
    s.html.includes('id="live-sort"'));
  assert(s.source.includes("E('live-filters').hidden=!hasRead"));
  assert.equal(s.config.version,'2.0.1');
  assert(s.html.includes('id="offline-tools"')&&s.html.includes('id="browser-panel"'),
    'Live Chrome management is the default; offline tools are secondary');
  assert(!/\b(?:window|globalThis|chrome)\.cookies\./.test(s.source));
  assert(!/<script\b/i.test(s.html));
  assert(!/@import\b|url\(\s*https?:/i.test(s.css));
  for(const match of s.source.matchAll(/\bE\('([^']+)'\)/g))
    assert(s.ids.includes(match[1]),'missing UI field: '+match[1]);
  for(const id of ['cookie-value','import-text','import-file'])
    assert(new RegExp('id="'+id+'"[^>]*data-sensitive="true"').test(s.html),'secret input: '+id);
  const pkg=await createSidebarToolPackage(project);
  assert.equal(pkg.id,'cookie-editor');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert(pkg.js.length<220000);
});
test('Cookie Header, JSON object, JSON array and Netscape import',async()=>{
  const a=await harness();a.setSite('shop.example.com');
  const header=a.parseImport('Cookie: sid=abc==; theme=dark','auto');
  assert.equal(header.length,2);
  assert.equal(header[0].name,'sid');
  assert.equal(header[0].value,'abc==');
  const mapped=a.parseImport('{"sid":"a","theme":"b"}','json');
  assert.equal(mapped.length,2);
  const array=a.parseImport('[{"name":"sid","value":"xyz","domain":".example.com","hostOnly":false,"path":"/"}]','json');
  assert.equal(array[0].domain,'.example.com');
  const wrapped=a.parseImport('{"cookies":[{"name":"sid","value":"x"}]}','json');
  assert.equal(wrapped.length,1);
  const netscape='# Netscape HTTP Cookie File\n'+
    '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsid\tvalue\n';
  const rows=a.parseImport(netscape,'netscape');
  assert.equal(rows.length,1);
  assert.equal(rows[0].httpOnly,true);
  assert.equal(rows[0].secure,true);
  assert.equal(rows[0].hostOnly,false);
});
test('JSON and Netscape round trip; Header explicitly carries name=value only',async()=>{
  const a=await harness();a.setSite('example.com');
  const rows=a.parseImport('[{"name":"sid","value":"a=b","httpOnly":true,"secure":true,"sameSite":"lax",'+
    '"domain":".example.com","hostOnly":false,"session":true}]','json');
  a.setRows(rows);
  const json=a.parseImport(a.exportText('json'),'json');
  assert.equal(json[0].httpOnly,true);
  assert.equal(json[0].value,'a=b');
  const netscape=a.parseImport(a.exportText('netscape'),'netscape');
  assert.equal(netscape[0].httpOnly,true);
  assert.equal(netscape[0].value,'a=b');
  assert.equal(a.exportText('header').trim(),'sid=a=b');
});
test('Import merge previews counts, deduplicates, and does not mutate source',async()=>{
  const a=await harness();a.setSite('example.com');
  const before=a.parseImport('sid=old','header');
  const incoming=a.parseImport('sid=new; theme=dark','header');
  const preview=a.mergeImport(incoming,before);
  assert.equal(preview.created,1);assert.equal(preview.replaced,1);
  assert.equal(before[0].value,'old');
  assert.equal(preview.cookies.find(row=>row.name==='sid').value,'new');
  expectError(()=>a.parseImport('sid=1; sid=2','header'),/重复/);
  expectError(()=>a.saveToList(before,{...before[0],value:'again'}),/已存在/);
  assert.equal(a.saveToList(before,{...before[0],value:'again'},before[0])[0].value,'again');
});
test('Reject bad fields, foreign domains, insecure prefixes, expired and oversized imports',async()=>{
  const a=await harness();a.setSite('shop.example.com');
  for(const [record,pattern] of [
    [{name:'sid',value:'x',domain:'other.org'},/域名/],
    [{name:'sid',value:'x',path:'missing-slash'},/路径/],
    [{name:'bad name',value:'x'},/名称/],
    [{name:'__Host-sid',value:'x',secure:false},/前缀/],
    [{name:'sid',value:'x',sameSite:'no_restriction',secure:false},/SameSite/],
    [{name:'sid',value:'x',session:false,expirationDate:1},/未来/]
  ])expectError(()=>a.normalizeCookie(record),pattern);
  expectError(()=>a.parseImport('not a cookie line','header'),/Header/);
  expectError(()=>a.parseImport('sid=x; sid=y','auto'),/重复/);
  expectError(()=>a.parseImport('sid='+('x'.repeat(150001)),'header'),/150 KB/);
  expectError(()=>a.parseImport('['+Array.from({length:101},(_,i)=>
    '{"name":"n'+i+'","value":"x"}').join(',')+']','json'),/100/);
});
test('Offline rename changes Name without changing scope or overwriting another Cookie',async()=>{
  const a=await harness();a.setSite('example.com');
  const row=a.normalizeCookie({name:'sid',value:'one',partitionKey:{topLevelSite:'https://example.com'}});
  const updated={...row,value:'two',name:'renamed'};
  const renamed=a.saveToList([row],updated,row);
  assert.equal(renamed.length,1);
  assert.equal(renamed[0].name,'renamed');
  assert.equal(renamed[0].value,'two');
  assert.equal(row.name,'sid','rename must not mutate source row');
  expectError(()=>a.saveToList([row],{...updated,path:'/changed'},row),/身份/);
  const duplicate=a.normalizeCookie({name:'renamed',value:'already'});
  expectError(()=>a.saveToList([row,duplicate],updated,row),/冲突/);
  a.setRows([row]);
  expectError(()=>a.exportText('netscape'),/分区/);
});
test('Cookie identity ignores partition key object order and missing/false ancestor',async()=>{
  const a=await harness();a.setSite('example.com');
  const row=a.normalizeCookie({name:'sid',value:'one',partitionKey:{
    topLevelSite:'https://example.com',hasCrossSiteAncestor:false}});
  const updated={...row,value:'two',partitionKey:{
    hasCrossSiteAncestor:false,topLevelSite:'https://example.com'}};
  assert.equal(a.saveToList([row],updated,row)[0].value,'two');
  const withoutAncestor={...updated,partitionKey:{topLevelSite:'https://example.com'}};
  assert.equal(a.saveToList([row],withoutAncestor,row)[0].value,'two');
  assert(a.source.includes('lookup.pathname!==row.path'),
    'Native mutation must refuse Cookie paths that cannot be represented without loss');
});

test('Only reviewed user.export files support non-executable .md/.txt/.json types',async()=>{
  const [host,bridge]=await Promise.all([
    get('src/ui/sidebar-tools.js'),get('src/sidebar-tools/bridge.js')
  ]);
  assert(host.includes('(?:md|txt|json)'),'native file exporter must allow JSON and text');
  assert(host.includes('application/json'));
  assert(bridge.includes("node.hasAttribute?.('data-sensitive')"),
    'host draft recovery must never retain cookie secrets');
});

test('Browser target is explicit HTTP(S), strips secret query, and allows a separately selected URL',async()=>{
  const s=await harness();
  const selected=s.parseTarget('https://shop.example.com/orders?id=secret#token');
  assert.equal(selected.hostname,'shop.example.com');
  assert.equal(selected.origin,'https://shop.example.com');
  assert.equal(selected.url,'https://shop.example.com/orders');
  for(const url of ['file:///tmp/a','chrome://settings','https://u:p@example.com/','http://[::1]/'])
    expectError(()=>s.parseTarget(url),/HTTP\(S\)|普通/);
  expectError(()=>s.parseTarget('https://example.com/?'+ 'x'.repeat(2100)),/2048/);
});

test('Browser metadata adapter never retains or reveals native Cookie values',async()=>{
  const s=await harness();
  const native=[{name:'sid',value:'secret-that-must-not-survive',domain:'.example.com',path:'/login',
    hostOnly:false,secure:true,httpOnly:true,session:true,storeId:'1',
    partitionKey:{topLevelSite:'https://example.com'},valueRedacted:false}];
  const rows=s.redactMetadata(native);
  assert.equal(rows.length,1);
  assert.equal(rows[0].valueRedacted,true);
  assert.equal(Object.hasOwn(rows[0],'value'),false);
  assert.equal(rows[0].path,'/login');
  assert.equal(rows[0].storeId,'1');
  assert.equal(rows[0].partitionKey.topLevelSite,'https://example.com');
  assert.equal(native[0].value,'secret-that-must-not-survive','native reply remains unmodified');
  expectError(()=>s.redactMetadata([null]),/元数据/);
  expectError(()=>s.redactMetadata(Array.from({length:501},()=>native[0])),/超出范围/);
});

test('Offline workspace remains isolated and browser writes or clears are not performed',async()=>{
  const s=await harness();
  assert(s.source.includes("mode='browser'"),'real mode opens first');
  assert(s.source.includes('browserSdk().cookies.set(options)'),
    'real writes must go through the public SDK');
  assert(s.source.includes('browserSdk().cookies.remove({url:target.url'),
    'exact deletion must go through the public SDK');
  assert(s.source.includes('browserSdk().cookies.clearSite({url:target.url,preview:true'),
    'live clear requires a distinct preview');
  assert(s.source.includes("if(confirmed&&stillCurrent(id,target))void readBrowserMetadata()"),
    'native writes with unknown effects must not automatically refresh or replay');
  assert(s.source.includes("if(mode==='browser')void saveBrowserCookie()"),
    'browser write and offline update must never share an ambiguous action path');
  assert(s.source.includes("old.valueRedacted===true&&!liveValueEdited"),
    'editing an undisclosed native Cookie must not silently write an empty value');
  assert(s.source.includes('source.cookie.valueRedacted!==false'),
    'the public SDK must confirm separately authorized sensitive value reads');
  assert(s.source.includes('if(renamed){')&&s.source.includes('newNameSaved=true'),
    'renaming creates a verified new Cookie before deleting its original identity');
  assert(s.source.includes("status('本地导入完成"));
  assert(s.source.includes("（仅本地预览）"));
  assert(s.html.includes('离线工作区'));
});

test('Public browser reader refuses missing site grant and always drops native values',async()=>{
  let status={callableNow:false,reasonCode:'E_ORIGIN_NOT_APPROVED'},reads=0;
  const s=await harness({capabilities:{getStatus:async()=>status},cookies:{
    getAll:async()=>{reads++;return [{name:'sid',value:'should-be-redacted',
      domain:'example.com',path:'/login',secure:true,httpOnly:true,session:true}];}
  }});
  s.setLiveTarget('https://example.com/login');
  await s.readBrowserMetadata();
  assert.equal(reads,0);
  assert.equal(s.liveSnapshot().state,'blocked');
  status={callableNow:true};
  await s.readBrowserMetadata();
  assert.equal(reads,2,'unpartitioned and explicitly approved partition are queried separately');
  assert.equal(s.liveSnapshot().state,'ready');
  assert.equal(s.liveSnapshot().rows[0].valueRedacted,true);
  assert.equal(Object.hasOwn(s.liveSnapshot().rows[0],'value'),false);
});

test('Site changes during asynchronous authorization stop an obsolete Cookie read',async()=>{
  let release,reads=0;
  const pending=new Promise(resolve=>{release=resolve;});
  const s=await harness({capabilities:{getStatus:()=>pending},cookies:{
    getAll:async()=>{reads++;return [];}
  }});
  s.setLiveTarget('https://example.com/login');
  const first=s.readBrowserMetadata();
  s.setLiveTarget('https://other.example.com/');
  release({callableNow:true});
  await first;
  assert.equal(reads,0,'obsolete site may not call the public SDK');
  assert.equal(s.liveSnapshot().rows.length,0);
});

test('An edited target must be confirmed before a live Cookie read',async()=>{
  let reads=0;
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},cookies:{
    getAll:async()=>{reads++;return [];}
  }});
  s.setLiveTarget('https://example.com/');
  s.setTargetPending(true);
  await s.readBrowserMetadata();
  assert.equal(reads,0);
});

test('Browser header never identifies the offline fallback as a real website',async()=>{
  const s=await harness();
  s.render();
  assert.equal(s.getSiteHeading(),'尚未选择网站');
  s.setLiveTarget('https://example.com/account');
  s.render();
  assert.equal(s.getSiteHeading(),'example.com');
});

test('Cookie partition metadata keeps cross-site ancestor and discards native values',async()=>{
  const s=await harness();
  const [row]=s.redactMetadata([{name:'sid',domain:'.example.com',path:'/',value:'TOP_SECRET',
    partitionKey:{topLevelSite:'https://first.example',hasCrossSiteAncestor:true}}]);
  assert.equal(row.partitionKey.hasCrossSiteAncestor,true);
  assert.equal(Object.hasOwn(row,'value'),false);
});

test('An in-flight Cookie read cannot repopulate metadata after target URL was edited',async()=>{
  let resolveRead,readStarted=false;
  const result=new Promise(resolve=>{resolveRead=resolve});
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},cookies:{
    getAll:async()=>{readStarted=true;return result;}
  }});
  s.setLiveTarget('https://example.com/account');
  const operation=s.readBrowserMetadata();
  for(let i=0;i<5&&!readStarted;i++)await Promise.resolve();
  assert.equal(readStarted,true);
  s.setTargetPending(true);
  resolveRead([{name:'sid',value:'TOP_SECRET',domain:'example.com',path:'/'}]);
  await operation;
  assert.equal(s.liveSnapshot().rows.length,0);
  assert.notEqual(s.liveSnapshot().state,'ready');
});

test('Live Chrome opens with automatic approved read, while denied sites stay unread',async()=>{
  let reads=0;
  const cookie={name:'sid',value:'NEVER_DISPLAY',domain:'example.com',path:'/',
    hostOnly:true,secure:false,httpOnly:false,session:true};
  const browser={capabilities:{getStatus:async()=>({callableNow:true})},
    cookies:{getAll:async ({partitionKey})=>{reads++;return partitionKey?[]:[cookie];}}};
  const s=await harness(browser,{currentPage:'https://example.com/login'});
  assert.equal(s.getSiteHeading(),'example.com');
  assert.equal(s.liveSnapshot().state,'ready');
  assert.equal(reads,2,'open should read each scope once, without an extra click');
  assert.equal(s.liveSnapshot().rows[0].valueRedacted,true);
  assert.equal(Object.hasOwn(s.liveSnapshot().rows[0],'value'),false);
  s.fire('refresh','click');
  await s.settle();
  assert.equal(reads,4,'one explicit refresh should trigger one scoped read, not two');
  assert.equal(s.liveSnapshot().state,'ready');
  const denied=await harness({capabilities:{getStatus:async()=>({callableNow:false})},
    cookies:{getAll:async()=>{throw new Error('unauthorized read')}}},
    {currentPage:'https://example.com/login'});
  assert.equal(denied.liveSnapshot().state,'blocked');
});


test('Browser metadata includes only the approved unpartitioned and partitioned Cookie scopes',async()=>{
  const origin='https://example.com',calls=[];
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},
    cookies:{
      getPartitionKey:async()=>({partitionKey:{topLevelSite:origin,hasCrossSiteAncestor:false}}),
      getAll:async options=>{
        calls.push(options);
        return options.partitionKey?
          [{name:'chips',value:'PARTITION_SECRET',domain:'example.com',path:'/',
            partitionKey:options.partitionKey,storeId:'0'}]:
          [{name:'base',value:'BASE_SECRET',domain:'example.com',path:'/',storeId:'0'}];
      }
    }});
  s.setLiveTarget(origin+'/');
  await s.readBrowserMetadata();
  assert.equal(s.liveSnapshot().state,'ready');
  assert.deepEqual(s.liveSnapshot().rows.map(x=>x.name),['base','chips']);
  assert(s.liveSnapshot().rows.every(x=>x.valueRedacted===true&&!Object.hasOwn(x,'value')));
  assert.equal(calls.length,2);
  assert.equal(calls[0].partitionKey,undefined);
  assert.equal(calls[1].partitionKey.topLevelSite,origin);
});
test('Unknown approved partition fails closed without displaying partial native data',async()=>{
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},
    cookies:{
      getPartitionKey:async()=>{throw Object.assign(new Error('partition revoked'),{code:'E_GRANT_REVOKED'});},
      getAll:async()=>[{name:'base',value:'SECRET',domain:'example.com',path:'/'}]
    }});
  s.setLiveTarget('https://example.com/');
  await s.readBrowserMetadata();
  assert.equal(s.liveSnapshot().state,'error');
  assert.equal(s.liveSnapshot().rows.length,0);
});

test('Real rename writes the new name first, verifies it, then removes only the old identity',async()=>{
  const rows=[{name:'old',value:'old-secret',domain:'example.com',path:'/account',
    hostOnly:true,secure:true,httpOnly:true,session:true,storeId:'0'}];
  const calls=[];
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},
    cookies:{
      getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://example.com'}}),
      getAll:async ({url,partitionKey})=>partitionKey?[]:
        rows.filter(row=>new URL(url).pathname.startsWith(row.path)),
      get:async()=>{throw new Error('value grant is intentionally not needed with a supplied value');},
      set:async options=>{
        calls.push(['set',options.name,options.url,options.path]);
        rows.push({...rows[0],name:options.name,value:options.value});
        return {saved:true,verified:true};
      },
      remove:async options=>{
        calls.push(['remove',options.name,options.domain,options.path,options.storeId]);
        const i=rows.findIndex(row=>row.name===options.name&&row.domain===options.domain&&row.path===options.path);
        if(i>=0)rows.splice(i,1);
        return {removed:true,verified:true};
      }
    }});
  s.setSite('example.com');s.setLiveTarget('https://example.com/account');
  await s.readBrowserMetadata();
  s.openEditor(s.liveSnapshot().rows[0]);
  assert.equal(s.getField('cookie-name').readOnly,false);
  assert.equal(s.getField('cookie-value').value,'','old secret must remain masked in the editor');
  s.getField('cookie-name').value='renamed';
  s.getField('cookie-value').value='new-value';
  s.fire('cookie-value','input',{isTrusted:true});
  await s.saveBrowserCookie();
  assert.equal(calls.map(x=>x[0]).join(','),'set,remove');
  assert.equal(calls[0][1],'renamed');
  assert.equal(calls[0][2],'https://example.com/account',
    'Chrome must verify writes at the Cookie Path, not at an unrelated root URL');
  assert.equal(calls[1][1],'old');
  assert.equal(calls[1][4],'0','removal is bound to the existing Cookie store');
  assert.equal(rows.length,1);
  assert.equal(rows[0].name,'renamed');
  assert.equal(rows[0].value,'new-value');
});

test('Real rename blocks collisions and does not mutate Chrome without authorization to preserve a hidden value',async()=>{
  const prior={name:'old',value:'SECRET',domain:'example.com',path:'/',
    hostOnly:true,session:true,storeId:'0'};
  let state=[prior,{...prior,name:'taken',value:'OTHER'}],writes=0,removals=0;
  const browser={capabilities:{getStatus:async()=>({callableNow:true})},cookies:{
    getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://example.com'}}),
    getAll:async({partitionKey})=>partitionKey?[]:state,
    get:async()=>{throw Object.assign(new Error('not approved'),{code:'E_VALUES_REQUIRED'});},
    set:async()=>{writes++;return {saved:true,verified:true};},
    remove:async()=>{removals++;return {removed:true,verified:true};}
  }};
  const s=await harness(browser);s.setSite('example.com');
  s.setLiveTarget('https://example.com/');await s.readBrowserMetadata();
  const old=s.liveSnapshot().rows.find(x=>x.name==='old');
  s.openEditor(old);s.getField('cookie-name').value='taken';
  s.getField('cookie-value').value='replacement';
  s.fire('cookie-value','input',{isTrusted:true});
  await s.saveBrowserCookie();
  assert.equal(writes,0);assert.equal(removals,0);
  assert.match(s.getStatusMessage(),/新名称已存在/);
  s.openEditor(old);s.getField('cookie-name').value='new-safe-name';
  await s.saveBrowserCookie();
  assert.equal(writes,0);assert.equal(removals,0);
  assert.match(s.getStatusMessage(),/敏感值/);
  assert.equal(s.getField('cookie-value').value,'',
    'denied value reads must not copy the original secret into the editor');
});

test('Partial rename failure reports both Cookie names possibly remaining and never retries',async()=>{
  const prior={name:'old',value:'SECRET',domain:'example.com',path:'/',
    hostOnly:true,session:true,storeId:'0'};
  let reads=[prior],writes=0,removals=0;
  const s=await harness({capabilities:{getStatus:async()=>({callableNow:true})},cookies:{
    getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://example.com'}}),
    getAll:async({partitionKey})=>partitionKey?[]:reads,
    set:async o=>{writes++;reads.push({...prior,name:o.name,value:o.value});
      return {saved:true,verified:true};},
    remove:async()=>{removals++;throw Object.assign(new Error('unknown side effect'),{code:'E_OUTCOME_UNKNOWN'});}
  }});
  s.setSite('example.com');s.setLiveTarget('https://example.com/');
  await s.readBrowserMetadata();s.openEditor(s.liveSnapshot().rows[0]);
  s.getField('cookie-name').value='new';s.getField('cookie-value').value='NEW';
  s.fire('cookie-value','input',{isTrusted:true});
  await s.saveBrowserCookie();
  assert.equal(writes,1);assert.equal(removals,1);
  assert.match(s.getStatusMessage(),/两条 Cookie 可能并存/);
  assert.equal(reads.length,2);
});
