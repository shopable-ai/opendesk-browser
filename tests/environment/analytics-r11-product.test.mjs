import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {installAnalyticsHost} from '../../src/analytics/host.js';
import {createAnalyticsGateway} from '../../services/analytics/worker.mjs';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE,OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE} from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {ANALYTICS_PROTOCOL,ANALYTICS_STATE_KEY,ANALYTICS_PAGE_SCOPE_CHECK,ANALYTICS_DISCLOSURE_VERSION} from '../../src/analytics/contract.js';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',
  ()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function d1(db){
  const prepare=sql=>({bind(...args){
    const query=db.prepare(sql);
    return {run:async()=>({meta:{changes:query.run(...args).changes}}),
      all:async()=>({results:query.all(...args)})};
  }});
  return {prepare,async batch(queries){
    db.exec('BEGIN IMMEDIATE');
    try{
      const result=[];for(const query of queries)result.push(await query.run());
      db.exec('COMMIT');return result;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }};
}
function chromeMock(installed){
  const records=new Map([[SIDEBAR_TOOL_STORE,installed]]);
  const messageListeners=[],changeListeners=[],alarmListeners=[];
  const id='analytics-test-extension';
  const api={runtime:{id,getURL:path=>'chrome-extension://'+id+'/'+path,
    onMessage:{addListener:cb=>messageListeners.push(cb)},
    onStartup:{addListener(){}},onInstalled:{addListener(){}}},
    tabs:{async sendMessage(tabId,message,target){
      assert.equal(tabId,12);
      assert.deepEqual(target,{frameId:0,documentId:'prompt-document'});
      assert.deepEqual(message,{protocol:ANALYTICS_PROTOCOL,kind:ANALYTICS_PAGE_SCOPE_CHECK,
        expectedUrl:'https://chatgpt.com/'});
      return records.get(SIDEBAR_TOOL_STORE)?.some(tool=>tool.id==='prompt-shortcuts')===true;
    },async get(tabId){
      assert.equal(tabId,12);
      return {id:12,url:'https://chatgpt.com/',incognito:false};
    }},
    webNavigation:{async getFrame(target){
      assert.deepEqual(target,{tabId:12,frameId:0});
      return {documentId:'prompt-document',url:'https://chatgpt.com/',
        documentLifecycle:'active',errorOccurred:false};
    }},
    alarms:{onAlarm:{addListener:cb=>alarmListeners.push(cb)},async create(){},async clear(){}},
    storage:{onChanged:{addListener:cb=>changeListeners.push(cb)},
      local:{async get(keys){
        const names=Array.isArray(keys)?keys:[keys];
        return Object.fromEntries(names.map(k=>[k,structuredClone(records.get(k))]));
      },async set(obj){
        const changes={};
        for(const [key,value] of Object.entries(obj)){
          changes[key]={oldValue:structuredClone(records.get(key)),newValue:structuredClone(value)};
          records.set(key,structuredClone(value));
        }
        for(const cb of changeListeners)cb(changes,'local');
      }}}
  };
  const send=(payload,sender)=>new Promise(resolve=>{
    const accepted=messageListeners.some(cb=>cb(payload,sender,resolve)===true);
    if(!accepted)resolve({ok:false,code:'NO_LISTENER'});
  });
  return {api,send,records};
}
async function eventually(check){
  for(let i=0;i<80;i++){
    if(await check())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Timed out waiting for trusted analytics storage');
}
test('real top-level Options tab can read consent and revoke while other documents remain rejected',async()=>{
  const {api,send,records}=chromeMock([]);
  const url=api.runtime.getURL('native-agent/settings.html');
  const options={id:api.runtime.id,url,origin:'chrome-extension://'+api.runtime.id,
    frameId:0,documentId:'real-options-document',documentLifecycle:'active',
    tab:{id:23,url,incognito:false}};
  const status={protocol:ANALYTICS_PROTOCOL,kind:'consent.status'};
  const enable={protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION};
  installAnalyticsHost({api,endpoint:'https://analytics.example.test/v1/events',newId:randomUUID,
    fetcher:()=>{throw Error('Consent operations must not upload');}});
  assert.equal((await send(status,options)).data.consent,false);
  assert.equal((await send(enable,options)).data.consent,true);
  assert.equal(records.get(ANALYTICS_STATE_KEY).consentReceipt.disclosureVersion,ANALYTICS_DISCLOSURE_VERSION);
  for(const bad of [
    {...options,id:'another-extension'},
    {...options,url:url+'?previewId=untrusted'},
    {...options,url:api.runtime.getURL('sidepanel.html')},
    {...options,frameId:1},
    {...options,frameId:undefined},
    {...options,documentId:undefined},
    {...options,documentLifecycle:'prerender'},
    {...options,origin:'https://example.test'},
    {...options,incognito:true},
    {...options,tab:{...options.tab,id:-1}},
    {...options,tab:{...options.tab,url:'https://example.test/'}},
    {...options,tab:{...options.tab,pendingUrl:'https://example.test/'}},
    {...options,tab:{...options.tab,incognito:true}}
  ]){
    assert.equal((await send(status,bad)).code,'E_SENDER');
    assert.equal((await send({...enable,enabled:false,disclosureVersion:undefined},bad)).code,'E_SENDER');
    assert.equal(records.get(ANALYTICS_STATE_KEY).consent,true);
  }
  assert.equal((await send({...enable,enabled:false,disclosureVersion:undefined},options)).data.consent,false);
  assert.deepEqual(records.get(ANALYTICS_STATE_KEY).queue,[]);
  assert.equal(records.get(ANALYTICS_STATE_KEY).installId,null);
});

test('real Options tab reports an unconfigured receiver without enabling collection',async()=>{
  const {api,send,records}=chromeMock([]),url=api.runtime.getURL('native-agent/settings.html');
  installAnalyticsHost({api,endpoint:''});
  const options={id:api.runtime.id,url,origin:'chrome-extension://'+api.runtime.id,
    frameId:0,documentId:'real-options-document',documentLifecycle:'active',tab:{id:23,url,incognito:false}};
  const response=await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.status'},options);
  assert.equal(response.ok,true);
  assert.equal(response.data.configured,false);
  assert.equal(response.data.consent,false);
  assert.equal((await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options)).ok,false);
  assert.notEqual(records.get(ANALYTICS_STATE_KEY)?.consent,true);
});

test('verified Side Panel opens → opt-in collector → real HTTP D1 → PostHog-shaped sink',async t=>{
  const now=Date.UTC(2026,9,20,12,0,0);
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../../services/analytics/schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  const received=[];
  const sink=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200);res.end('{}');
  });
  const sinkURL=await listen(sink);t.after(()=>close(sink));
  const pending=[];
  const env={DB:d1(db),POSTHOG_HOST:'https://eu.i.posthog.com',
    POSTHOG_PROJECT_TOKEN:'test_project_token_long',RATE_SALT:'test_salt_longer_than_twenty_four_characters'};
  const gateway=createAnalyticsGateway({now:()=>now,
    fetcher:(_url,options)=>fetch(sinkURL+'/batch/',options)});
  const receiver=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const result=await gateway.fetch(new Request('https://receiver.test'+req.url,{
      method:req.method,headers:req.headers,body:Buffer.concat(chunks)}),env,{
      waitUntil:task=>pending.push(task)});
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
  });
  const receiverURL=await listen(receiver);t.after(()=>close(receiver));
  const prompt=JSON.parse(await readFile(new URL(
    '../../examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json',import.meta.url),'utf8'));
  const {api,send,records}=chromeMock([prompt,{id:'cookie-editor'}]);
  const collector=installAnalyticsHost({api,endpoint:receiverURL+'/v1/events',allowLoopback:true,
    now:()=>now,newId:randomUUID,fetcher:globalThis.fetch});
  const id=api.runtime.id;
  const options={id,url:api.runtime.getURL('native-agent/settings.html'),frameId:0};
  const panel={id,url:api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID(),frameId:0};
  const page={id,url:'https://chatgpt.com/',frameId:0,documentId:'prompt-document',
    tab:{id:12,url:'https://chatgpt.com/',incognito:false}};
  const report=(event,toolId,sender=panel)=>send({
    protocol:ANALYTICS_PROTOCOL,kind:'event.host_report',event,toolId,channel:'sidepanel'},sender);
  assert.equal((await report('app.opened','opendesk')).data.recorded,false,
    'pre-consent is never collected');
  assert.equal((await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options)).ok,true);
  assert.equal((await report('app.opened','opendesk')).data.recorded,true);
  assert.equal((await report('app.opened','opendesk')).data.recorded,false,
    'same context reload is not a second opening');
  assert.equal((await report('tool.opened','cookie-editor')).ok,true);
  assert.equal((await report('tool.opened','prompt-shortcuts')).ok,true);
  assert.equal((await report('tool.opened','cookie-editor',{
    ...panel,url:panel.url+'&previewId=preview'})).code,'E_SENDER');
  assert.equal((await report('tool.opened','cookie-editor',{id,url:'https://evil.example/'})).code,'E_SENDER');
  const pageResult=await send({protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',
    event:'prompt.inserted',toolId:'prompt-shortcuts',channel:'page_button'},page);
  assert.equal(pageResult.ok,true,'reviewed page adapter may report successful engagement');
  assert.equal((await collector.flush()).sent,6);
  await Promise.allSettled(pending.splice(0));
  const batch=received.flatMap(row=>row.batch);
  assert.equal(batch.length,6);
  assert.deepEqual(batch.map(row=>row.event).sort(),[
    'app.inventory','app.opened','prompt.inserted','tool.engaged','tool.opened','tool.opened'].sort());
  assert.equal(new Set(batch.map(row=>row.distinct_id)).size,1,
    'DAU counts one installation, not six events or two tools');
  assert.deepEqual(batch.find(row=>row.event==='app.inventory').properties.installed_tools,
    ['cookie-editor','prompt-shortcuts'],'first opt-in includes previously installed tools');
  const gap=batch.find(row=>row.event==='app.inventory').properties;
  assert.deepEqual([gap.coverage_overflow,gap.coverage_expired,gap.coverage_version],
    [0,0,0],'HTTP/D1/PostHog path carries explicit coverage counters');
  assert(batch.every(row=>row.properties.$process_person_profile===false));
  assert(!JSON.stringify(received).includes('https://chatgpt.com/'));
  // A verified unsuccessful page-button attempt is still an active installation.
  const failed=await send({protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',
    event:'prompt.failed',toolId:'prompt-shortcuts',channel:'page_button',
    reason:'editor_changed'},page);
  assert.equal(failed.ok,true);
  assert.equal((await collector.flush()).sent,2);
  await Promise.allSettled(pending.splice(0));
  assert.deepEqual(received.flatMap(row=>row.batch).slice(-2).map(row=>row.event).sort(),
    ['prompt.failed','tool.engaged'].sort());
  // The actual persisted registry, not a speculative install button, changes census.
  await api.storage.local.set({[SIDEBAR_TOOL_STORE]:[prompt]});
  await eventually(()=>records.get(ANALYTICS_STATE_KEY)?.queue?.some(
    row=>row.event==='app.inventory'&&row.installedTools?.length===1));
  assert.equal((await collector.flush()).sent,2,'uninstall and replacement census are sent');
  await Promise.allSettled(pending.splice(0));
  const last=received.flatMap(row=>row.batch).filter(row=>row.event==='app.inventory').at(-1);
  assert.deepEqual(last.properties.installed_tools,['prompt-shortcuts']);
  assert.equal((await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:false},options)).ok,true);
  assert.equal(records.get(ANALYTICS_STATE_KEY).queue.length,0,'opt out discards queued events');
  assert.equal(records.get(ANALYTICS_STATE_KEY).installId,null);
  assert.equal((await report('tool.opened','prompt-shortcuts')).data.recorded,false);
});

test('Workflow independent readback must also pass original Host result; dedupe by private RunId',async()=>{
  const now=Date.UTC(2026,9,23,12);
  const {api,send,records}=chromeMock([{id:'cookie-editor'}]);
  let verified=false,reads=0;
  const runId=randomUUID(),beforeRunId=randomUUID(),afterRunId=randomUUID();
  const collector=installAnalyticsHost({api,endpoint:'https://analytics.example/v1/events',
    now:()=>now,newId:randomUUID,fetcher:async()=>{throw Error('offline');},
    verifyWorkflowResult:async(actionId,sender,ids)=>{
      reads++;return verified&&sender.documentId==='trusted-workflow'&&
        actionId===runId&&ids?.beforeRunId===beforeRunId&&ids?.afterRunId===afterRunId;
    }});
  const id=api.runtime.id;
  const panel={id,documentId:'trusted-workflow',frameId:0,
    url:api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID()};
  const options={id,url:api.runtime.getURL('native-agent/settings.html'),frameId:0};
  const event={protocol:ANALYTICS_PROTOCOL,kind:'event.workflow_verified',
    event:'workflow.business_effect_verified',toolId:'workflow',
    channel:'extension',runId,beforeRunId,afterRunId};
  assert.equal((await send(event,panel)).data.recorded,false);
  assert.equal(reads,0,'before consent no original Controller readback');
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options);
  assert.equal((await send(event,panel)).code,'E_SENDER',
    'failed Host corroboration cannot be B-grade');
  verified=true;
  assert.equal((await send({...event,afterRunId:beforeRunId},panel)).code,'E_SENDER',
    'reused observer Run must be rejected before verification');
  assert.equal((await send(event,{...panel,url:panel.url+'&previewId=x'})).code,'E_SENDER');
  assert.equal((await send(event,panel)).data.recorded,true);
  assert.equal((await send(event,panel)).data.recorded,false,'same Run cannot double-count');
  const queue=records.get(ANALYTICS_STATE_KEY).queue;
  const evidence=queue.filter(row=>row.event==='workflow.business_effect_verified');
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].evidenceLevel,'B');
  assert.equal(evidence[0].toolId,'workflow');
  assert(![runId,beforeRunId,afterRunId].some(id=>JSON.stringify(queue).includes(id)),
    'all three raw RunIds remain on this installation');
  assert(!queue.some(row=>row.event==='tool.engaged'||row.event==='tool.manual_attempt'),
    'an AI auto step cannot manufacture active DAU');
  // Simulate bounded local dedupe eviction + drained transport queue. Replayed
  // Host proof must use the exact same event UUID for D1/PostHog dedupe.
  const originalEventId=evidence[0].eventId;
  const stored=records.get(ANALYTICS_STATE_KEY);
  records.set(ANALYTICS_STATE_KEY,{...stored,verifiedWorkflowRunIds:[],queue:[]});
  assert.equal((await send(event,panel)).data.recorded,true);
  assert.equal(records.get(ANALYTICS_STATE_KEY).queue[0].eventId,originalEventId);
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:false},options);
  assert.equal(records.get(ANALYTICS_STATE_KEY).verifiedWorkflowRunIds.length,0);
  assert.equal((await send(event,panel)).data.recorded,false);
  assert.equal((await collector.status()).consent,false);
});

test('trusted Workflow Send counts once even on failure; later business evidence is not DAU',async()=>{
  const {api,send,records}=chromeMock([]);
  installAnalyticsHost({api,endpoint:'https://analytics.example/v1/events',
    now:()=>Date.UTC(2026,9,23,12),newId:randomUUID,
    fetcher:async()=>{throw Error('offline');}});
  const id=api.runtime.id;
  const panel={id,frameId:0,url:api.runtime.getURL('sidepanel.html')+
    '?hostInstanceId='+randomUUID()};
  const options={id,url:api.runtime.getURL('native-agent/settings.html')};
  const payload={protocol:ANALYTICS_PROTOCOL,kind:'event.workflow_attempt',
    event:'workflow.manual_attempt',toolId:'workflow',channel:'extension'};
  assert.equal((await send(payload,panel)).data.recorded,false);
  assert.equal(records.get(ANALYTICS_STATE_KEY),undefined);
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options);
  assert.equal((await send(payload,{...panel,url:panel.url+'&previewId=1'})).code,'E_SENDER');
  assert.equal((await send(payload,panel)).data.recorded,true);
  const rows=records.get(ANALYTICS_STATE_KEY).queue;
  assert.equal(rows.filter(row=>row.event==='workflow.manual_attempt').length,1);
  assert(!rows.some(row=>row.event==='workflow.business_effect_verified'),
    'a user gesture or Controller completed is not independently verified business effect');
  assert(!JSON.stringify(rows).includes('some-private-workflow-text'));
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:false},options);
  assert.equal((await send(payload,panel)).data.recorded,false);
});

test('Reading TOC B-grade requires official bytes, site, page, generation and consent',async()=>{
  const tool=await officialToolFixture('reading-toc'),pin=OFFICIAL_READING_TOC_RELEASE;
  const {api,send,records}=chromeMock([tool]);
  const provenance={[pin.id]:{marketId:pin.marketId,sha256:pin.sha256,version:pin.version}};
  await api.storage.local.set({[MARKET_PROVENANCE_STORE]:provenance});
  installAnalyticsHost({api,endpoint:'https://analytics.example/v1/events',
    now:()=>Date.UTC(2026,9,23,12),newId:randomUUID,
    fetcher:async()=>{throw Error('offline');}});
  const id=api.runtime.id,options={id,url:api.runtime.getURL('native-agent/settings.html')};
  const page={id,url:'https://chatgpt.com/',documentId:'prompt-document',frameId:0,
    tab:{id:12,url:'https://chatgpt.com/',incognito:false}};
  const nav={protocol:ANALYTICS_PROTOCOL,kind:'event.reading_toc_navigated',
    event:'reading_toc.navigated',toolId:'reading-toc',channel:'page_button',
    installationEpoch:null};
  assert.equal((await send(nav,page)).data.recorded,false);
  assert.equal(records.get(ANALYTICS_STATE_KEY),undefined);
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options);
  assert.equal((await send(nav,{...page,documentId:'stale-doc'})).code,'E_SENDER');
  assert.equal((await send(nav,{...page,frameId:1})).code,'E_SENDER');
  const {installationEpoch,...withoutEpoch}=nav;
  assert.equal((await send(withoutEpoch,page)).code,'E_SENDER');
  await api.storage.local.set({[MARKET_PROVENANCE_STORE]:{}});
  assert.equal((await send(nav,page)).code,'E_SENDER','ID without official provenance');
  await api.storage.local.set({[MARKET_PROVENANCE_STORE]:provenance,
    [SIDEBAR_TOOL_STORE]:[{...tool,js:tool.js+'/* unreviewed */'}]});
  assert.equal((await send(nav,page)).code,'E_SENDER','changed package source is not official');
  await api.storage.local.set({[SIDEBAR_TOOL_STORE]:[tool],
    [SIDEBAR_TOOL_ENABLE_STORE]:{'reading-toc':false}});
  assert.equal((await send(nav,page)).code,'E_SENDER','disabled tool must not claim navigation');
  await api.storage.local.set({[SIDEBAR_TOOL_ENABLE_STORE]:{},
    [READING_TOC_SITE_STORE]:{'reading-toc':{mode:'all-except',blockedOrigins:['https://chatgpt.com']}}});
  assert.equal((await send(nav,page)).code,'E_SENDER','site grant revoked');
  await api.storage.local.set({[READING_TOC_SITE_STORE]:{},
    [READING_TOC_PAGE_RULES_STORE]:{'reading-toc':['https://chatgpt.com/']}});
  assert.equal((await send(nav,page)).code,'E_SENDER','page explicitly disabled');
  const epoch=randomUUID();
  await api.storage.local.set({[READING_TOC_PAGE_RULES_STORE]:{},
    [TOOL_REVOCATION_EPOCHS_STORE]:{'reading-toc':epoch}});
  assert.equal((await send(nav,page)).code,'E_SENDER','old generation may not report');
  assert.equal((await send({...nav,installationEpoch:epoch},page)).data.recorded,true);
  const evidence=records.get(ANALYTICS_STATE_KEY).queue
    .filter(row=>row.event==='reading_toc.navigated');
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].evidenceLevel,'B');
  assert.equal(evidence[0].source,'page_adapter');
  assert(!JSON.stringify(evidence).includes('https://chatgpt.com/'));
  assert(!JSON.stringify(evidence).includes(epoch),'epoch remains local to Host');
});

test('R1.12 Page intent requires installed Authority; Host validates terminal receipt before anonymous telemetry',async()=>{
  const now=Date.UTC(2026,9,24,2),{api,send,records}=chromeMock([]);
  let allowed=false,terminal=null,reads=0;
  installAnalyticsHost({api,endpoint:'https://analytics.example/v1/events',now:()=>now,
    newId:randomUUID,fetcher:async()=>{throw Error('offline');},
    verifyManualPage:async()=>{reads++;return allowed;},
    readManualPageResult:async(_identity,_receipt,sender)=>{
      reads++;return sender.documentId==='trusted-page-host'?terminal:null;
    }});
  const panel={id:api.runtime.id,documentId:'trusted-page-host',frameId:0,
    url:api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID()};
  const options={id:api.runtime.id,url:api.runtime.getURL('native-agent/settings.html'),frameId:0};
  const base={protocol:ANALYTICS_PROTOCOL,toolId:'opendesk',toolType:'page',
    toolIdentity:'private-installed-program',channel:'extension'};
  const attempt={...base,kind:'event.manual_attempt',event:'tool.manual_attempt'};
  const receiptId=randomUUID(),result={...base,kind:'event.manual_result',event:'tool.manual_result',runId:receiptId};
  assert.equal((await send(attempt,panel)).data.recorded,false);
  assert.equal(reads,0,'before consent neither identity nor Authority is read');
  await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true,
    disclosureVersion:ANALYTICS_DISCLOSURE_VERSION},options);
  assert.equal((await send(attempt,panel)).code,'E_SENDER','no verified installation');
  allowed=true;
  assert.equal((await send(attempt,panel)).data.recorded,true,'denied execution still constitutes user intent');
  assert.equal((await send(result,panel)).code,'E_SENDER','a forged RunId is not a result');
  terminal={status:'failed'};
  assert.equal((await send(result,panel)).data.recorded,true);
  assert.equal((await send(result,panel)).data.recorded,false,'same durable receipt counted once');
  const rows=records.get(ANALYTICS_STATE_KEY).queue.filter(row=>row.toolType==='page');
  assert.deepEqual(rows.map(row=>row.event),['tool.manual_attempt','tool.manual_result']);
  assert.equal(rows[1].runStatus,'failed');
  assert(rows.every(row=>/^anon-[a-f0-9]{24}$/.test(row.toolId)));
  assert(!JSON.stringify(rows).includes(receiptId),'receipt never leaves the device');
  assert(!JSON.stringify(rows).includes('private-installed-program'),'raw program ID never leaves the device');
  const stableEventId=rows[1].eventId;
  const stored=records.get(ANALYTICS_STATE_KEY);
  records.set(ANALYTICS_STATE_KEY,{...stored,manualResultRunIds:[],queue:[]});
  assert.equal((await send(result,panel)).data.recorded,true,
    'a private bounded dedupe list is not a lifetime uniqueness guarantee');
  assert.equal(records.get(ANALYTICS_STATE_KEY).queue[0].eventId,stableEventId,
    'the original receipt must always map to one stable D1/PostHog event UUID');
});
