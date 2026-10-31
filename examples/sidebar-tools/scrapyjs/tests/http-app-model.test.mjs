import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({TextEncoder,URL,crypto:webcrypto});
for(const path of ['../adapters/app-sdk.js','../src/app-model.js'])vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
const {validateConfig,createApp,DEFAULT_CONFIG}=context.ScrapyAppModel;
const plain=value=>JSON.parse(JSON.stringify(value));
const config=()=>({executionMode:'http-local',url:'http://127.0.0.1:43121/http-echo',maxPages:3,
  http:{userAgent:'ScrapyJS local test',headers:{Accept:'application/json','X-Client-Tag':'local'}},
  itemConfig:{userAgent:'userAgent',accept:'accept',clientTag:'clientTag',requestId:'requestId',nested:'data.title'}});

test('HTTP config accepts optional UA/headers and string JSON point paths; DOM remains unchanged',()=>{
  assert.equal(DEFAULT_CONFIG.url,'http://127.0.0.1:43111/demo-form.html');
  const value=config();assert.deepEqual(plain(validateConfig(value)),value);
  for(const http of [undefined,{}, {userAgent:''}, {headers:{Accept:'*/*'}}]){
    const next=config();if(http===undefined)delete next.http;else next.http=http;
    assert.deepEqual(plain(validateConfig(next)),next);
  }
  assert.deepEqual(plain(validateConfig({...DEFAULT_CONFIG,maxPages:10})),{...plain(DEFAULT_CONFIG),maxPages:10});
  assert.throws(()=>validateConfig({...DEFAULT_CONFIG,http:{}}),/本机 HTTP/);
  assert.throws(()=>validateConfig({...DEFAULT_CONFIG,executionMode:'dom'}),/executionMode/);
});
test('HTTP scope rejects public URLs, alternate loopback spellings, ports and credential URLs',()=>{
  for(const url of ['https://example.com/http-echo','http://127.0.0.1:43111/http-echo','http://127.0.0.1:43112/http-echo','https://127.0.0.1:43121/http-echo',
    'http://localhost:43121/http-echo','http://127.1:43121/http-echo','http://127.0.0.1:43121.evil.test/http-echo',
    'http://user@127.0.0.1:43121/http-echo','file:///tmp/data'])assert.throws(()=>validateConfig({...config(),url}),url);
  for(const maxPages of [0,4,10,1.5,'3'])assert.throws(()=>validateConfig({...config(),maxPages}),/1–3/);
});
test('HTTP rejects DOM grammar, unsafe paths and malformed or privileged header drafts',()=>{
  for(const itemConfig of [{}, {x:{selector:'.title'}},{x:'.title::text'},{x:''},{x:'data..title'},
    {x:'data.__proto__.secret'},{constructor:'x'},{'bad key':'x'}, {x:42}])assert.throws(()=>validateConfig({...config(),itemConfig}));
  for(const option of [{nextPageSelector:'a'}, {waitForSelector:'body'}, {detail:{}},{processing:{version:1,rules:[]}},{validation:{version:1,rowShape:'row'}},{fieldRequirements:[]},{dedupeKey:'accept'}])assert.throws(()=>validateConfig({...config(),...option}),/DOM/);
  for(const http of [null,[],{code:'fetch()'},{userAgent:42},{userAgent:'ua\r\nInjected: yes'},
    {headers:[]},{headers:{Accept:42}},{headers:{'Bad Name':'x'}},{headers:{Accept:'x\nInjected: yes'}},
    ...['User-Agent','Host','Cookie','Authorization','Content-Length','Keep-Alive','TE','Trailer','Upgrade','Expect','Accept-Encoding'].map(key=>({headers:{[key]:'x'}}))])assert.throws(()=>validateConfig({...config(),http}));
});
test('HTTP additions stay inside original 4096-byte options/item and 8192-byte config budgets',()=>{
  assert.throws(()=>validateConfig({...config(),http:{userAgent:'中'.repeat(1400)}}),/User-Agent/);
  assert.throws(()=>validateConfig({...config(),http:{headers:{'X-Pad':'x'.repeat(4096)}}}),/4096/);
  assert.throws(()=>validateConfig({...config(),itemConfig:Object.fromEntries(Array.from({length:32},(_,i)=>['field'+i,'a'.repeat(128)]))}),/4096/);
  assert.throws(()=>validateConfig({...config(),url:'http://127.0.0.1:43121/'+ 'a'.repeat(8200)}),/8192/);
});
test('app.edit and named storage roundtrip preserve HTTP fields; invalid edits retain last valid config',async()=>{
  let record={value:null,etag:'initial'};
  const sdk={load:async()=>plain(record),save:async(value,etag)=>{
    assert.equal(etag,record.etag);record={value:plain(value),etag:'saved'};return {saved:true};
  }};
  const app=createApp(sdk);await app.load();app.edit(config());
  assert.throws(()=>app.edit({...config(),http:{headers:[]}}));
  assert.deepEqual(plain(app.state.config),config());
  assert.equal(await app.save('本机回显'),true);
  const reopened=createApp(sdk);await reopened.load();
  assert.equal(reopened.state.records[0].name,'本机回显');assert.deepEqual(plain(reopened.state.config),config());
  assert.equal(await reopened.newProfile(),true);reopened.edit(DEFAULT_CONFIG);await reopened.save('DOM');
  await reopened.selectProfile(record.value.records[0].id);
  assert.deepEqual(plain(reopened.state.config),config());
});
test('HTTP uses original prepare/start/read/stop task path, bounded options and active-run edit lock',async()=>{
  const calls=[],page={status:'available',url:'http://127.0.0.1:43121/http-echo'};
  const task={taskId:'scrapyjs.capture',version:'0.4.1'};
  const sdk=context.ScrapyAppSdk.createSdk(async(op,payload)=>{
    calls.push([op,plain(payload)]);
    if(op==='currentPage.info')return page;
    if(op==='tasks.read'&&payload.taskId)return {task};
    return {clientRequestId:payload.clientRequestId,runId:'http-run',state:op==='tasks.stop'?'stopping':'running',retirementState:'active'};
  });
  const app=createApp(sdk);app.edit(config());await app.refreshTarget();await app.start(page.url);
  assert.equal(app.state.phase,'running');assert.throws(()=>app.edit(DEFAULT_CONFIG),/运行期间/);
  await app.stop();
  const start=calls.find(([op])=>op==='tasks.start')[1];
  assert.deepEqual(start.task,task);assert.deepEqual(JSON.parse(start.params.configJson),config().itemConfig);
  const options=JSON.parse(start.params.optionsJson);
  assert.equal(options.executionMode,'http-local');assert.deepEqual(options.http,config().http);assert.equal(options.maxPages,3);
  assert.deepEqual(calls.filter(([op])=>op.startsWith('tasks.')).map(([op])=>op),['tasks.read','tasks.start','tasks.read','tasks.stop']);
});

test('start cannot replace a valid local HTTP config URL with a public current-page URL',async()=>{
  let starts=0;
  const app=createApp({currentPage:async()=>({status:'available',url:'https://example.com/'}),prepare:async()=>{},start:async()=>{starts++;}});
  app.edit(config());await app.refreshTarget();await app.start('https://example.com/');
  assert.equal(starts,0);assert.equal(app.state.phase,'idle');assert.match(app.state.error,/公网未开放/);
});

test('UA and header values accept printable ASCII only, with case-insensitive duplicate and reserved-name rejection',()=>{
  const ascii=Array.from({length:95},(_,i)=>String.fromCharCode(0x20+i)).join('');
  for(const userAgent of ['',ascii,'a'.repeat(512)])assert.doesNotThrow(()=>validateConfig({...config(),http:{userAgent}}));
  for(const userAgent of ['a'.repeat(513),'中文','é','\t','\n','\x1f','\x7f','\x80'])
    assert.throws(()=>validateConfig({...config(),http:{userAgent}}),/User-Agent/);
  for(const value of ['',ascii])assert.doesNotThrow(()=>validateConfig({...config(),http:{headers:{Accept:value}}}));
  for(const value of ['中文','é','\t','\x1f','\x7f','\x80','\xff'])
    assert.throws(()=>validateConfig({...config(),http:{headers:{Accept:value}}}),/Headers/);
  for(const headers of [{Accept:'one',accept:'two'}, {'X-Client-Tag':'one','x-client-tag':'two'},
    ...['Origin','rEfErEr','Sec-Fetch-Site','sEc-Custom','Proxy-Test','pRoXy-Authorization','X-OpenDesk-Request-Id','x-opendesk-custom'].map(name=>({[name]:'x'}))])
    assert.throws(()=>validateConfig({...config(),http:{headers}}),/Headers/);
});
test('HTTP rejects even empty hash and all DOM-only options instead of dropping them',()=>{
  for(const suffix of ['#','#fragment'])assert.throws(()=>validateConfig({...config(),url:config().url+suffix}),/hash/);
  assert.doesNotThrow(()=>validateConfig({...config(),url:config().url+'?value=%23'}));
  for(const key of ['waitForSelector','nextPageSelector','detail','processing','validation','fieldRequirements','dedupeKey'])
    for(const value of [undefined,null,''])assert.throws(()=>validateConfig({...config(),[key]:value}),/DOM/);
});
test('JSON mapping boundaries match the existing extractStaticJson parser, including Unicode field names',async()=>{
  const {extractStaticJson}=await import('../adapters/static-http-trial.mjs');
  const valid=[{'标题-1':'data.title',_value:'$root._value',字段:'a.b.c.d'},
    {['字'.repeat(64)]:'a'.repeat(128)},Object.fromEntries(Array.from({length:32},(_,i)=>['字段'+i,'value']))];
  // Both the model and real extraction parser must agree on the same mapping inputs.
  const rejected=[{'1field':'x'},{'field.name':'x'},{['字'.repeat(65)]:'x'},
    {field:'0'},{field:'data.0'},{field:'data.some-key'},{field:'a.b.c.d.e'},{field:'a'.repeat(129)},
    {field:'data.prototype'},JSON.parse('{"__proto__":"x"}'),
    Object.fromEntries(Array.from({length:33},(_,i)=>['field'+i,'value']))];
  for(const itemConfig of valid){
    assert.doesNotThrow(()=>extractStaticJson('{}',itemConfig));
    assert.doesNotThrow(()=>validateConfig({...config(),itemConfig}));
  }
  for(const itemConfig of rejected){
    assert.throws(()=>extractStaticJson('{}',itemConfig));
    assert.throws(()=>validateConfig({...config(),itemConfig}));
  }
});
test('valid HTTP values reach exact options/item/total byte budgets, then reject one extra byte',()=>{
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const optionsOf=({url,itemConfig,waitForSelector,timeoutMs,...options})=>options;
  const options=config();options.http={headers:{'X-Pad':''}};
  options.http.headers['X-Pad']='x'.repeat(4096-bytes(optionsOf(options)));
  assert.equal(bytes(optionsOf(options)),4096);assert.doesNotThrow(()=>validateConfig(options));
  options.http.headers['X-Pad']+='x';assert.throws(()=>validateConfig(options),/4096/);
  const mapping=config();mapping.itemConfig=Object.fromEntries(Array.from({length:32},(_,i)=>['field'+i,'a'.repeat(100)]));
  for(const key of Object.keys(mapping.itemConfig)){
    const extra=Math.min(128-mapping.itemConfig[key].length,4096-bytes(mapping.itemConfig));
    mapping.itemConfig[key]+='a'.repeat(extra);
  }
  assert.equal(bytes(mapping.itemConfig),4096);assert.doesNotThrow(()=>validateConfig(mapping));
  const key=Object.keys(mapping.itemConfig).find(key=>mapping.itemConfig[key].length<128);
  mapping.itemConfig[key]+='a';assert.throws(()=>validateConfig(mapping),/4096/);
  const total=config();total.url+='?pad=';total.url+='x'.repeat(8192-bytes(total));
  assert.equal(bytes(total),8192);assert.doesNotThrow(()=>validateConfig(total));
  total.url+='x';assert.throws(()=>validateConfig(total),/8192/);
});

test('HTTP timeout clamps at 15 seconds while DOM retains its original timeout range',()=>{
  for(const timeoutMs of [1,5000,15000,30000,60000]){
    assert.equal(validateConfig({...config(),timeoutMs}).timeoutMs,Math.min(timeoutMs,15000));
    assert.equal(validateConfig({...DEFAULT_CONFIG,timeoutMs}).timeoutMs,timeoutMs);
  }
  for(const timeoutMs of [0,-1,null,1.5,'15000',60001])
    assert.throws(()=>validateConfig({...config(),timeoutMs}));
});
test('HTTP start freezes URL, UA, headers, mapping, pages and timeout before async prepare',async()=>{
  let release;const prepared=new Promise(resolve=>{release=resolve;});let received;
  const page={status:'available',url:config().url};
  const app=createApp({currentPage:async()=>page,prepare:()=>prepared,
    start:async(value,_url,clientRequestId)=>{
      received=plain(value);return {clientRequestId,runId:'frozen-run',status:'running'};
    },read:async clientRequestId=>({clientRequestId,runId:'frozen-run',status:'completed',retired:true})});
  const input={...config(),timeoutMs:60000};app.edit(input);await app.refreshTarget();
  const running=app.start(page.url);
  assert.throws(()=>app.edit(DEFAULT_CONFIG),/运行期间/);
  input.http.headers.Accept='external edit';input.http.userAgent='external edit';
  app.state.config.url='https://example.com/';app.state.config.http.headers.Accept='state edit';
  app.state.config.itemConfig={wrong:'missing'};app.state.config.maxPages=1;app.state.config.timeoutMs=1;
  release();await running;
  assert.deepEqual(received,{...config(),timeoutMs:15000});
  assert.deepEqual(plain(app.state.runProfile.config),received);
  assert.equal(app.state.runId,'frozen-run');assert.equal(app.state.phase,'retired');
});
