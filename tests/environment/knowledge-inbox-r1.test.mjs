import {officialToolFixture,officialFixtures} from '../helpers/official-tools.mjs';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSidebarToolPackage,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {KNOWLEDGE_TOOL_ID,KNOWLEDGE_PROTOCOL,KNOWLEDGE_DATA_KEY,KNOWLEDGE_WORKSPACE_PREFIX,CAPTURE_SITE_STORE,
  changeCaptureGrant,captureAllowed,knowledgePackageHash,knowledgeDigest,KNOWLEDGE_LIMITS} from '../../src/knowledge/policy.js';
import {emptyKnowledgeStore,readKnowledgeStore,normalizeCapture,addKnowledgeRecord,updateKnowledgeRecord,listKnowledge,knowledgeMarkdown} from '../../src/knowledge/model.js';
import {createKnowledgeService,allowedCaptureImage} from '../../src/knowledge/service.js';
import {validateKnowledgeHandoff,initKnowledgeWorkspaceHandoff} from '../../src/knowledge/workspace-handoff.js';

const url='https://chatgpt.com/c/fixture-knowledge';
const pkg=await officialToolFixture('knowledge-inbox');
const packageHash=await knowledgePackageHash(pkg);
const input=(markdown='## 保存知识\n\n正文内容\n',extra={})=>({title:'保存知识',markdown,messageId:'answer-1',question:'怎么保存？',...extra});
const capture=async(markdown,extra={})=>normalizeCapture(input(markdown,extra),url,'2026-10-11T04:00:00.000Z');
function locks(){
  const queues=new Map();
  return {request(name,work){const prior=queues.get(name)||Promise.resolve();const next=prior.catch(()=>{}).then(work);queues.set(name,next);return next;}};
}
function fixture(){
  const store={[SIDEBAR_TOOL_STORE]:[structuredClone(pkg)],[CAPTURE_SITE_STORE]:changeCaptureGrant({},pkg.id,url,true)},session={},downloads=[],tabs=[];
  const area=data=>({get:async keys=>Object.fromEntries((keys===null?Object.keys(data):Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data[key])])),
    set:async values=>{Object.assign(data,structuredClone(values));},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}});
  const id='abcdefghijklmnopabcdefghijklmnop',hostURL='chrome-extension://'+id+'/ui/tool.html?hostInstanceId=12345678-1234-4123-8123-123456789abc';
  const api={runtime:{id,getURL:path=>'chrome-extension://'+id+'/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:hostURL,documentId:'host-doc',frameId:0,incognito:false}]},
    storage:{local:area(store),session:area(session)},permissions:{contains:async()=>true},
    webNavigation:{getFrame:async()=>({documentId:'page-doc',url,documentLifecycle:'active'})},
    tabs:{get:async()=>({id:9,url,status:'complete',incognito:false}),
      create:async value=>{tabs.push(value);return {id:100+tabs.length};},update:async(id,value)=>{tabs.push({id,...value});},remove:async()=>{}},
    downloads:{download:async options=>{downloads.push(options);return downloads.length;}}};
  const lockManager=locks(),service=createKnowledgeService({api,lockManager});
  const page={id,tab:{id:9,incognito:false},frameId:0,documentId:'page-doc',documentLifecycle:'active',url};
  const host={id,url:hostURL,documentId:'host-doc',frameId:0};
  const message=(operation,payload={})=>({protocol:KNOWLEDGE_PROTOCOL,toolId:pkg.id,packageHash,operation,payload,expectedUrl:url});
  const send=(operation,payload={},sender=operation.startsWith('capture.')?page:host)=>service.dispatch(message(operation,payload),sender);
  return {api,store,session,downloads,tabs,lockManager,service,host,page,message,send};
}

test('knowledge tool is a distinct, bounded, reproducible v1 package with explicit new capabilities',async()=>{
  assert.equal(validateSidebarToolPackage(pkg).id,KNOWLEDGE_TOOL_ID);
  assert.deepEqual(pkg.capabilities,['page.capture','knowledge.store','user.export']);
  assert.doesNotMatch(pkg.js,/chrome\.(?:runtime|storage|scripting|tabs)|\bfetch\s*\(/);
  const dir=await mkdtemp(join(tmpdir(),'knowledge-package-'));
  try{
    await buildSidebarTool('examples/sidebar-tools/knowledge-inbox',{out:join(dir,'tool.json')});
    const built=await readFile(join(dir,'tool.json'),'utf8');
    assert.equal(built,(await officialFixtures()).resources.get(officialPackagePath(pkg.id)).toString('utf8'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('capture requires separate origin consent and both declared capabilities',()=>{
  const grants=changeCaptureGrant({},pkg.id,url,true);
  assert.equal(captureAllowed([pkg],grants,url),true);
  assert.equal(captureAllowed([pkg],{},url),false);
  assert.equal(captureAllowed([] ,grants,url),false);
  assert.equal(captureAllowed([{...pkg,capabilities:['page.clip','knowledge.store']}],grants,url),false);
  assert.equal(captureAllowed([pkg],grants,'https://chatgpt.com.evil.example/c/a'),false);
  assert.throws(()=>changeCaptureGrant({},pkg.id,'http://chatgpt.com',true),/只支持/);
});
test('capture source strips secrets; repeated captures preserve personally edited metadata and draft',async()=>{
  const record=await normalizeCapture(input(),url+'?token=SECRET#private');
  assert.equal(record.source,url);
  const added=addKnowledgeRecord(emptyKnowledgeStore(),record);
  const modified=updateKnowledgeRecord(added.store,{id:record.id,ifRevision:1,title:'我的项目',kind:'draft',tags:['项目A'],note:'跟进',draft:'编辑后的草稿'});
  const again=addKnowledgeRecord(modified.store,await capture());
  assert.equal(again.duplicate,true);assert.equal(again.store.records.length,1);
  assert.equal(again.record.title,'我的项目');assert.equal(again.record.note,'跟进');assert.equal(again.record.draft,'编辑后的草稿');
  assert.equal(again.record.markdown,record.markdown);
  const changed=addKnowledgeRecord(again.store,await capture('回答新版本'));
  assert.equal(changed.store.records.length,2);assert.equal(changed.duplicate,false);
});
test('selection identity differs; search includes edited draft, labels and notes',async()=>{
  const original=await capture(),selection=await capture(original.markdown,{mode:'selection',question:''});
  assert.notEqual(selection.id,original.id);
  const updated=updateKnowledgeRecord({version:1,records:[original]},{id:original.id,ifRevision:1,title:original.title,kind:'draft',tags:['中文标签'],note:'关键备注',draft:'新的项目摘要'});
  assert.equal(listKnowledge(updated.store,{query:'项目 中文标签',kind:'draft'}).records.length,1);
  assert.equal(listKnowledge(updated.store,{query:'备注',kind:'idea'}).records.length,0);
  assert.match(knowledgeMarkdown(updated.record),/新的项目摘要/);
});
test('UTF-8 content, record count, total quota and malformed durable data fail without mutation',async()=>{
  await assert.rejects(()=>capture('中'.repeat(50001)),/150 KB/);
  const record=await capture();
  for(const patch of [{tags:[123]},{source:null},{question:{}},{contentHash:'bad'},{markdown:'x'.repeat(200000)},{draft:8}])
    assert.throws(()=>readKnowledgeStore({version:1,records:[{...record,...patch}]}),/数据无效/);
  const full={version:1,records:Array.from({length:200},(_,i)=>({...record,id:String(i).padStart(64,'0')}))};
  assert.throws(()=>addKnowledgeRecord(full,{...record,id:'f'.repeat(64)}),/已满/);
  assert.equal(full.records.length,200);
  const large=await capture('字'.repeat(49000));
  let next=emptyKnowledgeStore(),overflow=false;
  for(let i=0;i<40;i++)try{next=addKnowledgeRecord(next,{...large,id:String(i).padStart(64,'0')}).store;}catch{overflow=true;break;}
  assert.equal(overflow,true);assert.ok(Buffer.byteLength(JSON.stringify(next))<=KNOWLEDGE_LIMITS.totalBytes);
});
test('two page captures are serialized, duplicates stay singular, stale editors cannot overwrite',async()=>{
  const f=fixture();
  await Promise.all([f.send('capture.save',input()),f.send('capture.save',input('另一个回答',{messageId:'answer-2'}))]);
  assert.equal(f.store[KNOWLEDGE_DATA_KEY].records.length,2);
  const result=await f.send('capture.save',input());assert.equal(result.duplicate,true);
  const row=(await f.send('knowledge.get',{id:result.id})).record;
  const update={id:row.id,ifRevision:row.revision,title:'已编辑',kind:'idea',tags:[],note:''};
  await f.send('knowledge.update',update);
  await assert.rejects(()=>f.send('knowledge.update',{...update,title:'旧窗口'}),/其他窗口/);
  assert.equal(f.store[KNOWLEDGE_DATA_KEY].records.find(r=>r.id===row.id).title,'已编辑');
});
test('page cannot read the inbox; invalid iframe, host document, tool hash and source are rejected',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send('knowledge.list',{},f.page),/工具宿主/);
  await assert.rejects(()=>f.send('capture.save',input(),{...f.page,frameId:2}),/顶层/);
  await assert.rejects(()=>f.service.dispatch({...f.message('capture.save',input()),packageHash:'0'.repeat(64)},f.page),/更新或卸载/);
  await assert.rejects(()=>f.send('knowledge.list',{}, {...f.host,url:f.host.url+'&toolId=other-tool'}),/工具宿主/);
  await assert.rejects(()=>f.send('knowledge.list',{}, {...f.host,documentId:'old-host'}),/侧栏文档/);
  f.api.runtime.getContexts=async()=>[];
  await assert.rejects(()=>f.send('knowledge.list',{}, {...f.host,documentId:undefined}),/侧栏文档/);
});
test('independent extension TAB verifies its live context when webNavigation has no frame',async()=>{
  const f=fixture(),host={...f.host,tab:{id:10,incognito:false}};
  let context={contextType:'TAB',documentUrl:host.url,documentId:host.documentId,tabId:10,frameId:0,incognito:false};
  f.api.webNavigation.getFrame=async()=>null;
  f.api.runtime.getContexts=async filter=>{
    assert.deepEqual(filter,{contextTypes:['TAB'],documentUrls:[host.url],tabIds:[10]});
    return context?[context]:[];
  };
  assert.equal((await f.send('knowledge.list',{},host)).records.length,0);
  const live={...context};
  for(const patch of [{documentId:'reloaded-host'},{tabId:11},{frameId:1},{incognito:true},
    {documentUrl:host.url+'&other=1'},{contextType:'SIDE_PANEL'}]){
    context={...live,...patch};
    await assert.rejects(()=>f.send('knowledge.list',{},host),/工具宿主文档已变化/);
  }
  context=null;
  await assert.rejects(()=>f.send('knowledge.list',{},host),/工具宿主文档已变化/);
  context=live;
  await assert.rejects(()=>f.send('knowledge.list',{}, {...host,documentId:undefined}),/工具宿主文档已变化/);
});
test('same-URL reload, navigation and browser permission removal fence page writes',async()=>{
  const f=fixture();
  f.api.tabs.get=async()=>({id:9,url,pendingUrl:url,status:'loading'});
  await assert.rejects(()=>f.send('capture.save',input()),/网页已切换/);
  f.api.tabs.get=async()=>({id:9,url,status:'complete'});
  let frameReads=0;
  f.api.webNavigation.getFrame=async()=>({url,documentId:++frameReads===1?'page-doc':'reloaded-doc'});
  await assert.rejects(()=>f.send('capture.save',input()),/文档已刷新/);
  f.api.webNavigation.getFrame=async()=>({url,documentId:'page-doc'});
  let checks=0;f.api.permissions.contains=async()=>++checks===1;
  await assert.rejects(()=>f.send('capture.save',input()),/权限已撤销/);
  assert.equal(f.store[KNOWLEDGE_DATA_KEY],undefined);
});
test('capture and uninstall use one lock; queued stale captures never recreate removed data',async()=>{
  const f=fixture();
  const first=f.send('capture.save',input());
  const remove=f.lockManager.request('opendesk.sidebar-tools:tool:'+pkg.id,async()=>{
    delete f.store[KNOWLEDGE_DATA_KEY];f.store[SIDEBAR_TOOL_STORE]=[];f.store[CAPTURE_SITE_STORE]={};
  });
  await Promise.allSettled([first,remove]);
  await assert.rejects(()=>f.send('capture.save',input()),/更新或卸载/);
  assert.equal(f.store[KNOWLEDGE_DATA_KEY],undefined);
});
test('full Markdown export exceeds old clip budget without truncating; direct download survives broken inbox',async()=>{
  const f=fixture();const body='x'.repeat(150000);
  const saved=await f.send('capture.save',input(body,{question:'q'.repeat(2000)}));
  await f.send('knowledge.download',{id:saved.id});
  const text=decodeURIComponent(f.downloads[0].url.split(',').slice(1).join(','));
  assert.ok(Buffer.byteLength(text)>150000);assert.ok(text.includes(body));
  f.store[KNOWLEDGE_DATA_KEY]={broken:true};
  await f.send('capture.download',input());assert.equal(f.downloads.length,2);
  await assert.rejects(()=>f.send('capture.save',input()),/数据无效/);
  assert.deepEqual(f.store[KNOWLEDGE_DATA_KEY],{broken:true});
});
test('image download rejects arbitrary origins and data/blob resources; acknowledges only Chrome request',async()=>{
  assert.equal(allowedCaptureImage('https://files.oaiusercontent.com/file.png?se=signed'),true);
  for(const url of ['https://127.0.0.1/private','javascript:alert(1)','data:image/svg+xml,a','blob:https://chatgpt.com/123','https://chatgpt.com.evil.test/a'])assert.equal(allowedCaptureImage(url),false);
  const f=fixture();const result=await f.send('capture.image',{url:'https://files.oaiusercontent.com/image.png'});
  assert.deepEqual(result,{downloadId:1});assert.equal(f.store[KNOWLEDGE_DATA_KEY],undefined);
});
test('Workspace handoff is tab-bound, expires, preserves exact text and never dispatches Native writes',async()=>{
  const f=fixture();const saved=await f.send('capture.save',input());
  const result=await f.send('knowledge.workspace',{id:saved.id});
  assert.equal(result.savedToDisk,false);assert.equal(f.tabs[0].url,'about:blank');
  assert.equal(f.tabs[1].url,f.api.runtime.getURL('native-agent/workspace.html'));
  const draft=f.session[KNOWLEDGE_WORKSPACE_PREFIX+result.tabId];
  assert.equal(draft.sha256,await knowledgeDigest(draft.markdown));
  assert.equal((await validateKnowledgeHandoff(draft,{installed:[pkg]})).markdown,draft.markdown);
  await assert.rejects(()=>validateKnowledgeHandoff({...draft,markdown:'changed'},{installed:[pkg]}),/不完整/);
  await assert.rejects(()=>validateKnowledgeHandoff(draft,{installed:[],now:Date.now()}),/工具已变化/);
  await assert.rejects(()=>validateKnowledgeHandoff(draft,{installed:[pkg],now:draft.expiresAt+1}),/已过期/);
  const large=await f.send('capture.save',input('x'.repeat(33000),{messageId:'big'}));
  await assert.rejects(()=>f.send('knowledge.workspace',{id:large.id}),/32 KiB/);
  assert.equal(f.store[KNOWLEDGE_DATA_KEY].records.length,2);
});

test('v1 capture migration fills only an absent draft and does not mutate the stored input',async()=>{
  const early=await capture();delete early.draft;
  const original={version:1,records:[early]};
  assert.equal(readKnowledgeStore(original).records[0].draft,null);
  assert.equal(Object.hasOwn(early,'draft'),false);
  assert.throws(()=>readKnowledgeStore({version:1,records:[{...early,draft:undefined}]}),/数据无效/);
  const full={version:1,records:Array.from({length:28},(_,i)=>({...early,id:i.toString(16).padStart(64,'0'),markdown:'x'.repeat(i<27?150000:1)}))};
  const remaining=KNOWLEDGE_LIMITS.totalBytes-Buffer.byteLength(JSON.stringify(full));
  full.records.at(-1).markdown+='x'.repeat(remaining);
  assert.equal(Buffer.byteLength(JSON.stringify(full)),KNOWLEDGE_LIMITS.totalBytes);
  assert.equal(readKnowledgeStore(full).records.length,28,'a valid full early store remains readable for backup and removal');
});
test('Workspace import rereads durable session under the uninstall lock, and retains failed handoffs',async()=>{
  const f=fixture();const saved=await f.send('capture.save',input());
  const sent=await f.send('knowledge.workspace',{id:saved.id});
  f.api.tabs.getCurrent=async()=>({id:sent.tabId});
  const key=KNOWLEDGE_WORKSPACE_PREFIX+sent.tabId,original=structuredClone(f.session[key]);
  let click,imported=0,fail=false;const errors=[],taken=[];
  const button={addEventListener:(_name,fn)=>{click=fn;},removeEventListener(){}};
  const panel={},title={};
  const helper=initKnowledgeWorkspaceHandoff({api:f.api,doc:{getElementById:id=>id==='knowledge-handoff'?panel:id==='knowledge-handoff-import'?button:title},
    canImport:()=>true,onImport:async()=>{imported++;return !fail;},report:error=>errors.push(error.message),
    lockManager:{request:(name,work)=>{taken.push(name);return f.lockManager.request(name,work);}}});
  try{
    // The signed v1.1.0 package is larger; crypto validation may span more than ten event-loop turns on CI.
    const deadline=Date.now()+3500;
    while(panel.hidden!==false&&!errors.length&&Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(panel.hidden,false,'Workspace handoff initialization failed: '+errors.map(e=>e.message||e).join('; '));
    delete f.session[key];
    await click({isTrusted:true});assert.equal(imported,0);assert.match(errors.at(-1),/已过期|不完整/);
    f.session[key]=original;fail=true;
    await click({isTrusted:true});assert.equal(imported,1);assert.ok(f.session[key],'failed import remains recoverable');
    fail=false;await click({isTrusted:false});assert.equal(imported,1);
    await click({isTrusted:true});assert.equal(imported,2);assert.equal(f.session[key],undefined);
    assert.ok(taken.every(name=>name==='opendesk.sidebar-tools:tool:knowledge-inbox'));
  }finally{helper.dispose();}
});
