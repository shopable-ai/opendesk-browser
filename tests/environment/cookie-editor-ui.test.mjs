import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext,Script} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const project='examples/sidebar-tools/cookie-editor';
const get=path=>readFile(path,'utf8');
async function harness(browser=null){
  const [source,html,css,config]=await Promise.all([
    get(project+'/src/main.js'),get(project+'/src/index.html'),
    get(project+'/src/style.css'),get(project+'/tool.config.json').then(JSON.parse)]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements=new Map(ids.map(id=>[id,{
    id,value:'',hidden:true,disabled:false,checked:false,
    addEventListener(){},focus(){},append(){},replaceChildren(){},setAttribute(){},
    classList:{add(){},remove(){}}
  }]));
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
    'sortCookies,parseTarget,redactMetadata,readBrowserMetadata,'+
    'setLiveTarget:url=>{liveTarget=parseTarget(url);targetPending=false;liveRows=[];liveState="idle"},'+
    'setTargetPending:value=>{targetPending=value},'+
    'liveSnapshot:()=>({rows:liveRows,state:liveState,message:liveMessage}),'+
    'render,getSiteHeading:()=>E("site-host").textContent,'+
    'setSite:host=>{data={hostname:host,origin:"https://"+host,cookies:[]}},'+
    'setRows:rows=>{data={...data,cookies:rows}}};\n})();');
  const context={
    OpenDeskTool:{root,request:async()=>({status:'unavailable'}),setState(){}},
    OpenDeskSDK:browser?{browser}:undefined,
    Blob,Date,URL,TextEncoder,structuredClone,console
  };
  new Script(instrument,{filename:'cookie-editor-main.js'}).runInNewContext(context);
  // The initial asynchronous current-page lookup must settle before adapter assertions.
  await new Promise(resolve=>setImmediate(resolve));
  return {...context.__cookieTest,source,html,css,config,ids};
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
  assert(s.source.includes('sdk.cookies.getAll({url:target.url})'));
  assert(s.source.includes("permission?.callableNow"));
  assert(s.html.includes('id="mode-browser"')&&s.html.includes('id="mode-offline"'));
  assert(s.html.includes('id="read-live"')&&s.html.includes('id="target-url" data-sensitive="true"'));
  assert(s.html.includes('id="browser-panel"')&&s.html.includes('id="cookie-content"'));
  assert(s.html.includes('id="live-search"')&&s.html.includes('id="live-filter"'));
  assert(s.source.includes("E('live-filters').hidden=!hasRead"));
  assert.match(s.config.version,/^2\.0\./);
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
test('Editing cannot alter cookie identity, and Netscape must not drop partitioned cookies',async()=>{
  const a=await harness();a.setSite('example.com');
  const row=a.normalizeCookie({name:'sid',value:'one',partitionKey:{topLevelSite:'https://example.com'}});
  const updated={...row,value:'two'};
  assert.equal(a.saveToList([row],updated,row)[0].value,'two');
  expectError(()=>a.saveToList([row],{...updated,path:'/changed'},row),/身份/);
  a.setRows([row]);
  expectError(()=>a.exportText('netscape'),/分区/);
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
  assert(s.source.includes("if(mode==='browser')void saveBrowserCookie()"),
    'browser write and offline update must never share an ambiguous action path');
  assert(s.source.includes("editing?.valueRedacted===true&&!liveValueEdited"),
    'editing an undisclosed native Cookie must not accidentally overwrite its value with an empty string');
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
  assert.equal(reads,1);
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

test('Explicit refresh retries only an authorized read and never reuses a stale target',async()=>{
  const s=await harness();
  assert(s.source.includes('const refreshedEpoch=epoch+1;'));
  assert(s.source.includes("if(epoch===refreshedEpoch&&mode==='browser'&&!targetPending"));
  assert(s.source.includes('return readBrowserMetadata()'));
  assert(s.source.includes('valueRedacted:true'));
});
