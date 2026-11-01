import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const context = vm.createContext({TextEncoder, URL, crypto:webcrypto});
for (const path of ['../adapters/app-sdk.js', '../src/app-model.js']) vm.runInContext(await readFile(new URL(path, import.meta.url), 'utf8'), context);
const {createApp, validateConfig, DEFAULT_CONFIG} = context.ScrapyAppModel;
const plain = v => JSON.parse(JSON.stringify(v));
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject};};
const page = {status:'available', url:'http://127.0.0.1:43111/demo-form.html', title:'Demo'};
test('output field names accept multilingual metadata without widening capture grammar',()=>{
  const config={...plain(DEFAULT_CONFIG),output:{fieldNames:{title:'标题',source:'来源'}}};
  assert.deepEqual(plain(validateConfig(config)),config);
  for(const output of [{script:'run()'},{fieldNames:[]},{fieldNames:{title:'a\nb'}},{fieldNames:{title:1}},{fieldNames:JSON.parse('{"__proto__":"x"}')}])
    assert.throws(()=>validateConfig({...config,output}),/表头|名称|输出/);
});
test('explicit field order survives codec key sorting without changing rules or engine options',async()=>{
 const config={...plain(DEFAULT_CONFIG),itemConfig:{...plain(DEFAULT_CONFIG.itemConfig),source:'a::href'},output:{fieldNames:{title:'标题'},fieldOrder:['source','title']}};
 const normalized=plain(validateConfig(config));
 assert.deepEqual(Object.keys(normalized.itemConfig),['_listContainer','_listItem','source','title']);
 assert.equal(normalized.itemConfig.title,config.itemConfig.title);assert.equal(normalized.itemConfig.source,config.itemConfig.source);
 const reordered=JSON.parse(JSON.stringify(normalized,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value));
 assert.deepEqual(Object.keys(validateConfig(reordered).itemConfig),['_listContainer','_listItem','source','title']);
 for(const fieldOrder of [['title','title'],['__proto__'],['bad\nkey'],'title'])assert.throws(()=>validateConfig({...config,output:{fieldOrder}}),/排序|顺序/);
});
test('CSV custom headers preserve raw export, JSON, complete values and formula defenses',async()=>{
  const calls=[],sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push(plain(payload));return {started:true};});
  const snapshot={result:{data:[{title:'=1+1',source:'网站',nested:{ok:true}},{title:'另一个',extra:0}]}};
  const original=JSON.stringify(snapshot),output={fieldNames:{title:'标题',source:'来源',nested:'=公式'}};
  await sdk.download(snapshot,'csv',output);
  assert.ok(calls.at(-1).text.startsWith('"标题","来源","\'=公式","extra"\r\n'));
  assert.ok(calls.at(-1).text.includes('"\'=1+1"'));
  await sdk.download(snapshot,'csv');assert.ok(calls.at(-1).text.startsWith('"title","source","nested","extra"'));
  await sdk.download(snapshot,'json',output);assert.equal(calls.at(-1).text,JSON.stringify(snapshot,null,2));
  assert.equal(JSON.stringify(snapshot),original);
  const count=calls.length;
  await assert.rejects(sdk.download(snapshot,'csv',{fieldNames:{title:'重复',source:'重复'}}),/重复/);
  assert.equal(calls.length,count);
});
test('output names never enter the fixed task execution options',async()=>{
  const calls=[],sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push({op,payload:plain(payload)});return payload.taskId?{task:{taskId:'scrapyjs.capture'}}:{state:'running'};});
  await sdk.prepare();await sdk.start({...plain(DEFAULT_CONFIG),output:{fieldNames:{title:'标题'}}},page.url,'header-test');
  assert.deepEqual(JSON.parse(calls.at(-1).payload.params.optionsJson),{});
});
function setup(overrides = {}) {
  const calls = [];
  const sdk = {prepare: async()=>{}, currentPage: async () => page, start: async (config,url,clientRequestId) => ({clientRequestId,runId:'original',status:'running'}),
    read: async clientRequestId => ({clientRequestId,runId:'original',status:'running',engineStatus:'extracting',retired:false}),
    stop: async clientRequestId => {calls.push(clientRequestId); return {clientRequestId,runId:null,accepted:true,retired:false};},
    load: async () => ({value:null,etag:'initial'}), save: async () => ({saved:true}), download: async () => ({started:true}), ...overrides};
  return {app:createApp(sdk),calls,sdk};
}
test('bounded list detail run exposes partial list outcome alongside detail completion',async()=>{
  const {app}=setup({read:async clientRequestId=>({clientRequestId,runId:'original',status:'completed',engineStatus:'completed',retired:true,
    result:{data:[{id:'A'}],engine:{status:'completed'},list:{engine:{status:'partial',stopReason:'page_limit'}}}})});
  await app.refreshTarget();await app.start(page.url);await app.refresh();
  assert.match(app.state.engine,/列表 partial \(page_limit\)/);assert.deepEqual(plain(app.state.result.data),[{id:'A'}]);
});
for (const failure of ['prepare', 'currentPage', 'changedPage', 'pageGeneration', 'cancel']) {
  test(`restart before dispatch preserves retired results on ${failure}`,async()=>{
    let starts=0;
    const {app,sdk,calls}=setup({
      start:async(config,url,clientRequestId)=>{starts++;return {clientRequestId,runId:'original',status:'running'};},
      read:async clientRequestId=>({clientRequestId,runId:'original',status:'completed',retired:true,
        result:{data:[{title:'previous result'}],engine:{status:'completed'}}})
    });
    await app.refreshTarget();await app.start(page.url);
    const fields=['result','snapshot','runProfile','runId','clientRequestId','retired','engine','phase','stopRequested','stopAccepted'];
    const previous=Object.fromEntries(fields.map(key=>[key,app.state[key]]));
    const pending=deferred();sdk.prepare=()=>pending.promise;
    if(failure==='currentPage')sdk.currentPage=async()=>{throw Error('page failed');};
    if(failure==='changedPage')sdk.currentPage=async()=>({...page,url:page.url+'?changed'});
    if(failure==='pageGeneration')sdk.currentPage=async()=>{
      sdk.currentPage=async()=>page;await app.refreshTarget();return page;
    };
    const restarting=app.start(page.url);
    assert.equal(app.state.phase,'starting');
    await app.start(page.url);assert.equal(starts,1);
    assert.throws(()=>app.edit(DEFAULT_CONFIG),/运行期间/);
    if(failure==='cancel'){await app.stop();await app.stop();}
    if(failure==='prepare')pending.reject(Error('prepare failed'));else pending.resolve();
    await restarting;
    assert.equal(starts,1);assert.equal(calls.length,0);
    for(const key of fields)assert.strictEqual(app.state[key],previous[key],key);
    if(failure==='cancel')assert.match(app.state.notice,/未发起任务/);
    else assert.match(app.state.error,/failed|当前网页已变化/);
  });
}
test('dispatched restart replaces retired ownership and an unknown send cannot replay',async()=>{
  const {app,sdk}=setup({read:async clientRequestId=>({clientRequestId,runId:'original',status:'completed',retired:true,
    result:{data:[{title:'previous result'}]}})});
  await app.refreshTarget();await app.start(page.url);
  const previousId=app.state.clientRequestId,previousProfile=app.state.runProfile;
  let starts=0;
  sdk.start=async(config,url,clientRequestId)=>{
    starts++;
    assert.notEqual(clientRequestId,previousId);
    assert.notEqual(app.state.runProfile,previousProfile);
    assert.equal(app.state.result,null);assert.equal(app.state.snapshot,null);
    assert.equal(app.state.runId,null);assert.equal(app.state.retired,false);
    throw Error('send outcome unknown');
  };
  await app.start(page.url);await app.start(page.url);
  assert.equal(starts,1);assert.equal(app.state.phase,'unknown');
  assert.match(app.state.error,/send outcome unknown/);
});
test('input only accepts bounded declarative configuration', () => {
  assert.deepEqual(plain(validateConfig(DEFAULT_CONFIG)),plain(DEFAULT_CONFIG));
  assert.equal(validateConfig({...DEFAULT_CONFIG,timeoutMs:60000}).timeoutMs,60000);
  assert.throws(()=>validateConfig({...DEFAULT_CONFIG,timeoutMs:60001}),/60000/);
  for (const value of [null, [], {...DEFAULT_CONFIG, code:'alert(1)'}, {...DEFAULT_CONFIG,url:'file:///etc/passwd'},
    {...DEFAULT_CONFIG,itemConfig:{_listContainer: ''}}, {...DEFAULT_CONFIG,timeoutMs:60001},
    {...DEFAULT_CONFIG,itemConfig:{title:{selector:'a',read:'execute'}}}]) assert.throws(() => validateConfig(value));
  const native = {...DEFAULT_CONFIG,itemConfig:{_listContainer:'#sample-list',_listItem:'li',title:':scope::text',nested:{href:{selector:'a',read:'attr',attr:'href',cardinality:'one'}}}};
  assert.deepEqual(plain(validateConfig(native)),native);
});
test('target URL must match trusted current page; changed target never starts', async () => {
  let started=0; const {app,sdk}=setup({start:async()=>{started++;}});
  await app.refreshTarget(); await app.start('https://example.com'); assert.equal(started,0); assert.match(app.state.error,/当前网页/);
  sdk.currentPage=async()=>({...page,url:'https://example.org'});
  await app.start(page.url); assert.equal(started,0); assert.equal(app.state.phase,'idle');
});
test('cancel before target check finishes does not issue start', async () => {
  const {app,sdk}=setup(); await app.refreshTarget(); const check=deferred(); sdk.currentPage=()=>check.promise;
  const run=app.start(page.url); await app.stop(); check.resolve(page); await run;
  assert.equal(app.state.runId,null); assert.equal(app.state.phase,'idle');
});
test('cancel before start receipt stops the original run once and waits for retirement', async () => {
  const pending=deferred(), sent=deferred(); const {app,calls,sdk}=setup({start:()=>{sent.resolve();return pending.promise;}});
  await app.refreshTarget(); const run=app.start(page.url); await sent.promise; await app.stop();
  assert.deepEqual(calls,[app.state.clientRequestId]);
  pending.resolve({clientRequestId:app.state.clientRequestId,runId:'original',status:'running'}); await run;
  assert.deepEqual(calls,[app.state.clientRequestId]); assert.equal(app.state.stopAccepted,true); assert.equal(app.state.retired,false);
  await app.stop(); assert.equal(calls.length,1);
  sdk.read=async clientRequestId=>({clientRequestId,runId:'original',status:'stopped',engineStatus:'cancelled',retired:false,result:{items:[]}});
  await app.refresh(); assert.equal(app.state.retired,false); assert.equal(app.state.phase,'stopping');
  sdk.read=async clientRequestId=>({clientRequestId,runId:'original',status:'stopped',retired:true}); await app.refresh(); assert.equal(app.state.retired,true);
});
test('mismatched result identities are rejected and never rendered', async () => {
  const {app}=setup({read:async()=>({runId:'other',result:{secret:true}})});
  await app.refreshTarget(); await app.start(page.url); assert.equal(app.state.result,null); assert.match(app.state.error,/身份/);
});
test('unknown start outcome blocks replay', async () => {
  let calls=0; const {app}=setup({start:async()=>{calls++;throw new Error('response lost');}});
  await app.refreshTarget(); await app.start(page.url); await app.start(page.url);
  assert.equal(calls,1); assert.equal(app.state.phase,'unknown');
});
test('host terminal status alone cannot confirm retirement or fabricate engine state', async () => {
  const {app}=setup({read:async clientRequestId=>({clientRequestId,runId:'original',status:'completed',result:{items:[{text:'real'}]}})});
  await app.refreshTarget(); await app.start(page.url);
  assert.equal(app.state.retired,false); assert.equal(app.state.engine,'未报告'); assert.equal(app.state.result.items[0].text,'real');
});
test('confirmed retirement clears only the obsolete waiting-for-retirement notice',async()=>{
  let retired=false;
  const {app}=setup({read:async clientRequestId=>({clientRequestId,runId:'original',status:'completed',retired,
    result:{data:[],engine:{status:'completed'}}})});
  await app.refreshTarget();await app.start(page.url);await app.refresh();
  assert.match(app.state.notice,/等待/);assert.equal(app.state.retired,false);
  retired=true;await app.refresh();
  assert.equal(app.state.retired,true);assert.equal(app.state.notice,'');
});
test('read permission failures remain classified without discarding drafts or inventing a storage conflict',async()=>{
  const denied=()=>{throw Object.assign(Error('权限不足'),{code:'E_PERMISSION_DENIED'});};
  const {app,sdk}=setup({load:denied,currentPage:denied});
  app.edit({...DEFAULT_CONFIG,timeoutMs:8000});
  await app.load();await app.refreshTarget();
  assert.equal(app.state.storageError?.code,'E_PERMISSION_DENIED');
  assert.equal(app.state.targetError?.code,'E_PERMISSION_DENIED');
  assert.equal(app.state.config.timeoutMs,8000);assert.equal(app.state.conflict,null);
  sdk.load=async()=>({value:null,etag:'recovered'});sdk.currentPage=async()=>page;
  await app.load();await app.refreshTarget();
  assert.equal(app.state.storageError,null);assert.equal(app.state.targetError,null);
  assert.equal(app.state.config.timeoutMs,8000);
});
test('conditional storage survives reopen and preserves edited draft during initial load', async () => {
  let record={value:null,etag:'a'}; const writes=[];
  const sdk={load:async()=>plain(record),save:async(value,etag)=>{writes.push(etag);record={value:plain(value),etag:'b'};return {saved:true};}};
  const {app}=setup(sdk); await app.load(); app.edit({...DEFAULT_CONFIG,timeoutMs:5000}); await app.save();
  assert.deepEqual(writes,['a']); assert.equal(app.state.dirty,false);
  const reopened=setup(sdk).app; await reopened.load(); assert.equal(reopened.state.config.timeoutMs,5000);
  const pending=deferred(), loading=setup({load:()=>pending.promise}).app;
  const read=loading.load(); loading.edit({...DEFAULT_CONFIG,timeoutMs:8000}); pending.resolve(record); await read;
  assert.equal(loading.state.config.timeoutMs,8000); assert.equal(loading.state.conflict.config.timeoutMs,5000);
});
test('save readback accepts the original codec object ordering and keeps the new CAS token', async () => {
  const {encodeValue,decodeValue}=await import('../../../../src/platform/page-port/codec.js');
  let record={value:null,etag:'initial'}; const writes=[];
  const {app}=setup({load:async()=>plain(record),save:async(value,etag)=>{
    writes.push(etag); record={value:decodeValue(encodeValue(plain(value))),etag:'saved-'+writes.length};return {saved:true};
  }});
  await app.load();app.edit({...DEFAULT_CONFIG,timeoutMs:5000});await app.save();
  assert.equal(app.state.error,'');assert.equal(app.state.dirty,false);assert.equal(app.state.storageReady,true);
  app.edit({...DEFAULT_CONFIG,timeoutMs:6000});await app.save();
  assert.deepEqual(writes,['initial','saved-1']);assert.equal(app.state.config.timeoutMs,6000);
});
test('a genuinely changed post-save value retains the draft and blocks another write', async () => {
  let record={value:null,etag:'initial'},writes=0;
  const {app}=setup({load:async()=>plain(record),save:async value=>{
    writes++;const remote=plain(value);remote.records[0].config.timeoutMs=7000;record={value:remote,etag:'other-writer'};return {saved:true};
  }});
  await app.load();app.edit({...DEFAULT_CONFIG,timeoutMs:5000});await app.save();
  assert.match(app.state.error,/保存后版本已变化/);assert.equal(app.state.config.timeoutMs,5000);
  assert.equal(app.state.dirty,true);assert.equal(app.state.conflict.config.timeoutMs,7000);
  await app.save();assert.equal(writes,1);
});
test('storage conflict retains draft, reads current version and never overwrites automatically', async () => {
  let reads=0,writes=0; const {app}=setup({load:async()=>({value:reads++ ? {...DEFAULT_CONFIG,timeoutMs:7000}:null,etag:String(reads)}),
    save:async()=>{writes++;throw new Error('E_STORAGE_CONFLICT');}});
  await app.load(); app.edit({...DEFAULT_CONFIG,timeoutMs:3000}); await app.save();
  assert.equal(app.state.config.timeoutMs,3000); assert.equal(app.state.conflict.config.timeoutMs,7000); assert.equal(writes,1);
  await app.save(); assert.equal(writes,1); app.useSaved(); await app.confirmAction(); assert.equal(app.state.config.timeoutMs,7000); assert.equal(app.state.dirty,false);
});
test('SDK adapter uses bounded conditional storage and complete JSON download', async () => {
  const calls=[]; const sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push([op,payload]);return {saved:true,started:true};});
  await sdk.save({selector:'x'},null); assert.equal(calls[0][1].ifMatch,null);
  await assert.rejects(sdk.save({x:'中'.repeat(3000)},'a'),/8192/);
  await assert.rejects(sdk.save({selector:'x'},undefined),/ETag/);
  await sdk.download({items:[{text:'完整'}]}); assert.equal(calls.at(-1)[1].filename,'scrapyjs-result.json');
  await assert.rejects(sdk.download({items:['中'.repeat(51000)]}),/150000/);
  assert.equal(calls.length,2);
});
test('CSV uses the existing bounded Browser SDK export and preserves quotes, Unicode and nested values', async () => {
  const {normalizeBrowserOperation}=await import('../../../../src/framework/sdk/browser-contract.js');
  let actual;
  const sdk=context.ScrapyAppSdk.createSdk(async(operation,payload)=>{
    normalizeBrowserOperation(operation,plain(payload));actual={operation,...plain(payload)};return {started:true};
  });
  const receipt=await sdk.download({result:{data:[{title:'产品,"设计"',tags:['一','二']},{title:'第二行\n内容',extra:0}]}},'csv');
  assert.equal(receipt.started,true);assert.equal(actual.operation,'browser.downloads.text');
  assert.equal(actual.filename,'scrapyjs-result.csv');
  assert.equal(actual.text,'"title","tags","extra"\r\n"产品,""设计""","[""一"",""二""]",""\r\n"第二行\n内容","","0"');
});
test('SDK task requests pin the installed revision and correlate pre-reply cancellation', async () => {
  const calls=[],task={taskId:'scrapyjs.capture',version:'0.1.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),installationId:'00000000-0000-4000-8000-000000000000',generation:1};
  const sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push([op,plain(payload)]);return payload.taskId?{task}:{clientRequestId:payload.clientRequestId,state:'running'};});
  await sdk.prepare();await sdk.start(DEFAULT_CONFIG,page.url,'capture-1');await sdk.stop('capture-1');await sdk.read('capture-1');
  calls.shift();
  assert.deepEqual(calls.map(([op])=>op),['tasks.start','tasks.stop','tasks.read']);
  assert.deepEqual(calls[0][1].task,task);assert.equal(calls[0][1].clientRequestId,'capture-1');
  assert.deepEqual(calls[1][1],{clientRequestId:'capture-1'});
  assert.equal('tabId' in calls[0][1],false);assert.equal('code' in calls[0][1],false);
  assert.equal(calls[0][1].params.configJson,JSON.stringify(DEFAULT_CONFIG.itemConfig));
  assert.ok(Object.values(calls[0][1].params).every(value=>['string','number','boolean'].includes(typeof value)));
  assert.throws(()=>validateConfig({...DEFAULT_CONFIG,itemConfig:{title:'中'.repeat(1400)}}),/4096/);
});
test('stale fixed Task reports task recovery without changing saved capture configurations or starting', async () => {
  const calls=[];
  const sdk=context.ScrapyAppSdk.createSdk(async(op)=>{
    calls.push(op);
    if(op==='currentPage.info')return page;
    if(op==='tasks.read')throw Object.assign(new Error('内置运行时已改变或旧版本未记录身份；请保存新版本并重新验证'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
    throw new Error('Unexpected operation: '+op);
  });
  const app=createApp(sdk);
  const before=plain(app.state.config);
  await app.refreshTarget();await app.start(page.url);
  assert.match(app.state.error,/固定采集任务.*运行时/);
  assert.match(app.state.error,/更新.*scrapyjs/);
  assert.match(app.state.error,/采集配置已保留/);
  assert.equal(app.state.phase,'idle');assert.equal(app.state.clientRequestId,null);
  assert.deepEqual(plain(app.state.config),before);
  assert.deepEqual(calls,['currentPage.info','tasks.read']);
});
test('failed Task preparation discards the previous installed identity and preserves other failures', async () => {
  const failure=Object.assign(new Error('Permission denied'),{code:'E_PERMISSION'});
  let fail=false,starts=0;
  const sdk=context.ScrapyAppSdk.createSdk(async(op)=>{
    if(op==='tasks.read'){if(fail)throw failure;return {task:{taskId:'scrapyjs.capture'}};}
    if(op==='tasks.start')starts++;
  });
  await sdk.prepare();fail=true;
  await assert.rejects(sdk.prepare(),error=>error===failure);
  await assert.rejects(sdk.start(DEFAULT_CONFIG,page.url,'stale-task'),/尚未确认安装身份/);
  assert.equal(starts,0);
});
test('CSV escapes formula prefixes in fields and values while JSON retains original data',async()=>{
  const calls=[],sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push(plain(payload));return {started:true};});
  const data=[{'=key':'=1+1',plus:'+cmd',minus:'-1+2',at:'@SUM(A1)',tab:'\tcommand',newline:'\rcommand',space:'  =1',number:-2,plain:'a=b'}];
  const snapshot={result:{data}},before=JSON.stringify(snapshot);
  await sdk.download(snapshot,'csv');const csv=calls.at(-1).text;
  for(const value of ['=key','=1+1','+cmd','-1+2','@SUM(A1)','\tcommand','\rcommand','  =1'])assert.ok(csv.includes('"\''+value+'"'),value);
  assert.ok(csv.includes('"-2"'));assert.ok(csv.includes('"a=b"'));
  await sdk.download(snapshot);assert.equal(calls.at(-1).text,JSON.stringify(snapshot,null,2));assert.equal(JSON.stringify(snapshot),before);
});
test('default list config uses native SDK XPath self context for direct-text li records', async () => {
  const {createRequire}=await import('node:module');
  const require=createRequire(import.meta.url);
  const {normalizeConfig,extractRecords}=require('../vendor/scrapyjs/src/item/item-loader-extraction.js');
  const normalized=normalizeConfig(plain(DEFAULT_CONFIG.itemConfig));
  assert.equal(normalized.listSelector,'#sample-list');assert.equal(normalized.itemSelector,'li');
  assert.equal(normalized.fields[0].field.selector,'.');assert.equal(normalized.fields[0].field.xpath,true);
  assert.equal(normalized.fields[0].field.attr,'text');
  // Execute the unchanged source callback. Test DOM provides only each li's own text,
  // no descendants; XPath '.' returns its actual context, unlike querySelectorAll(':scope').
  const fixture=await readFile(new URL('../../../../examples/tasks/demo-form.html',import.meta.url),'utf8');
  const list=fixture.match(/<ul id="sample-list"[^>]*>([\s\S]*?)<\/ul>/)[1];
  const titles=[...list.matchAll(/<li>([^<]*)<\/li>/g)].map(match=>match[1]);
  const nodes=titles.map(textContent=>({textContent,nodeType:1,children:[],contains(node){return node===this;},matches:selector=>selector==='li',querySelectorAll:()=>[]}));
  const container={children:nodes};
  const document={querySelectorAll:selector=>selector==='#sample-list'?[container]:selector==='li'?nodes:selector==='*'?[container,...nodes]:[],
    evaluate(selector,node){assert.equal(selector,'.');return {snapshotLength:1,snapshotItem:()=>node};}};
  const dom=vm.createContext({document,XPathResult:{ORDERED_NODE_SNAPSHOT_TYPE:7},config:normalized});
  const result=vm.runInContext('('+extractRecords.toString()+')(config)',dom);
  assert.deepEqual(plain(result.records),titles.map(title=>({title})));
});

test('pagination/detail grammar reaches exact Task params without executable strings or unbounded options',async()=>{
  const {pagination,listDetail}=await import('../examples/configs.js');
  for(const config of [pagination,listDetail])assert.deepEqual(plain(validateConfig(config)),config);
  for(const detail of [{...listDetail.detail,code:'eval()'},{...listDetail.detail,urlField:'absent'},
    {...listDetail.detail,numberFields:['missing']}])assert.throws(()=>validateConfig({...listDetail,detail}));
  assert.throws(()=>validateConfig({...pagination,maxPages:11}));
  const calls=[],sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{calls.push([op,plain(payload)]);return payload.taskId?{task:{taskId:payload.taskId}}:{clientRequestId:payload.clientRequestId,state:'running'};});
  await sdk.prepare();await sdk.start(listDetail,listDetail.url,'id');
  const params=calls.at(-1)[1].params;
  assert.deepEqual(JSON.parse(params.configJson),listDetail.itemConfig);
  assert.deepEqual(JSON.parse(params.optionsJson).detail,listDetail.detail);
});

test('download feedback retires previous success before a pending or failed request',async()=>{
  const {app,sdk}=setup();app.state.snapshot={result:{data:[{title:'完整'}]}};app.state.result=app.state.snapshot.result;
  await app.download();assert.match(app.state.notice,/已请求下载完整 JSON/);
  const next=deferred();sdk.download=()=>next.promise;const request=app.download('csv');
  assert.equal(app.state.notice,'');assert.equal(app.state.error,'');
  next.reject(Error('下载被拒绝'));await request;
  assert.equal(app.state.notice,'');assert.equal(app.state.error,'下载被拒绝');
  assert.deepEqual(plain(app.state.result.data),[{title:'完整'}]);
});

test('editing a saved copy clears the previous success receipt while retaining its saved identity',async()=>{
  let record={value:null,etag:'initial'};
  const {app}=setup({load:async()=>plain(record),save:async value=>{record={value:plain(value),etag:'copied'};}});await app.load();
  assert.equal(await app.copyProfile('独立副本'),true);
  const id=app.state.selectedId,saved=plain(app.state.records);
  assert.match(app.state.notice,/保存为独立副本/);
  app.edit({...plain(app.state.config),maxPages:3});
  assert.equal(app.state.notice,'');assert.equal(app.state.dirty,true);
  assert.equal(app.state.selectedId,id);assert.deepEqual(plain(app.state.records),saved);
});
