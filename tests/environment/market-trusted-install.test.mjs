import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {MARKET_INTENTS_STORE,MARKET_INTENT_TTL,consumeReviewIntent} from '../../src/marketplace/intent.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {readMarketInstallStatus} from '../../src/marketplace/status.js';

// Exercise the trusted UI with the real intent, journal, installer and status.
// Distribution and panel ownership are injected: real owner validation has separate backend tests.
// Intent, journal, installer and readback remain real; these tests neither fetch nor open Chrome.
const entry=new URL('../../src/marketplace/install.js',import.meta.url);
const source=(await readFile(entry,'utf8'))
  .replace("import {loadMarketTool} from './distribution.js';",
    'const loadMarketTool=(...args)=>globalThis.__marketTrustedTestLoad(...args);')
  .replace(/from '([^']+)'/g,(_match,path)=>'from '+JSON.stringify(new URL(path,entry).href));
const {createMarketInstallReview,initMarketInstall}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tool={format:'opendesk.sidebar-tool.v1',id:'trusted-review-test',version:'1.0.0',title:'应用示例',
  description:'独立应用',capabilities:['storage.local'],html:'<main>Example</main>',css:'',js:'void 0;'};

class Element{
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.ownText='';}
  set textContent(text){this.ownText=text;this.children=[];}
  get textContent(){return this.ownText+this.children.map(child=>child.textContent).join('');}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.ownText='';this.children=[];this.append(...children);}
  insertBefore(child,reference){child.parent=this;this.children.splice(this.children.indexOf(reference),0,child);}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
  setAttribute(name,value){(this.attributes??={})[name]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  querySelector(tag){return this.children.find(child=>child.tag===tag);}
}
async function harness(t){
  const originals=new Map(['document','window','location','__marketTrustedTestLoad'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const time=Date.now(),row={intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID(),
    subject:{kind:'app',marketId:'opendesk/'+tool.id,version:tool.version},origin:'http://127.0.0.1:43132',
    createdAt:time,expiresAt:time+MARKET_INTENT_TTL,phase:'opened',tabId:2,consumedAt:null,settledAt:null,closureReason:null};
  const values={[MARKET_INTENTS_STORE]:{schema:MARKET_INTENTS_STORE,intents:[row],requests:[]}},writes=[],opened=[],focused=[];
  const h={values,writes,opened,focused,panelOpened:[],downloads:0,closes:0,offline:false,changed:false,cancelFails:false,
    assertOwner:async()=>{},assertCanInstall:()=>{},models:[]};
  const api={runtime:{id:'a'.repeat(32),getURL:path=>'chrome-extension://'+'a'.repeat(32)+'/'+path},
    storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(values[key])]));},
      async set(rows){if(h.cancelFails&&rows[MARKET_INTENTS_STORE]?.intents[0]?.cancelledAt)throw Error('取消写入失败');
        writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));},async remove(key){delete values[key];}}},
    tabs:{async create(options){opened.push(options);return {id:3,windowId:4};}},
    windows:{async update(id,options){focused.push({id,...options});}}};
  const locks=new Map(),lockManager={request(name,work){const next=(locks.get(name)||Promise.resolve()).then(work);locks.set(name,next.catch(()=>{}));return next;}};
  Object.assign(h,{api,lockManager,row:()=>values[MARKET_INTENTS_STORE].intents[0]});
  h.openApp=identity=>{h.panelOpened.push(identity);return true;};
  globalThis.document={createElement:tag=>new Element(tag)};
  globalThis.location={search:'?intent='+row.reviewId};
  globalThis.window={close(){h.closes++;}};
  globalThis.__marketTrustedTestLoad=async()=>{
    h.downloads++;await h.beforeLoad?.(h.downloads);if(h.offline)throw Error('市场暂时无法连接');
    const candidate=h.changed?{...tool,js:'void 1;'}:tool;
    return {tool:structuredClone(candidate),release:{sha256:await sidebarToolPackageHash(candidate)}};
  };
  h.mount=()=>{
    h.ui=createMarketInstallReview({api,lockManager,reviewId:row.reviewId,assertOwner:()=>h.assertOwner(),
      assertCanInstall:id=>h.assertCanInstall(id),
      openInstalledApp:identity=>h.openApp(identity),
      onChange:model=>{h.model=model;h.models.push(model);},onClose:()=>{h.closes++;}});
    h.model=h.ui.getSnapshot();return h.ui;
  };
  h.start=async()=>{h.mount();await h.ui.ready;};
  h.buttons=()=>h.model.actions.map(action=>action.label);
  h.click=async label=>{const action=h.model.actions.find(action=>action.label===label);assert.ok(action,'missing action: '+label);await h.ui.act(action.id);};
  h.message=()=>h.model.message;
  h.consume=async()=>consumeReviewIntent({api,lockManager,reviewId:row.reviewId,operationId:row.operationId,
    subject:row.subject,sha256:await sidebarToolPackageHash(tool)});
  return h;
}

test('trusted installation review exposes the exact fixed Task approval before install',async t=>{
  const h=await harness(t);
  const pin={taskId:'fixed.capture',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
  const candidate={...tool,format:'opendesk.sidebar-tool.v2',capabilities:['tasks.run'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},delegatedTasks:[pin]};
  globalThis.__marketTrustedTestLoad=async()=>({tool:candidate,release:{sha256:await sidebarToolPackageHash(candidate)}});
  await h.start();
  assert.deepEqual(h.buttons(),['确认安装','取消安装']);
  assert.deepEqual(h.model.details.capabilityCodes,['tasks.run']);
  for(const value of Object.values(pin)){
    assert.ok(h.model.details.description.includes(value));
    assert.ok(h.model.summary.join('\n').includes(value));
  }
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});

test('one generic review explains capabilities and persists cancellation before completion',async t=>{
  const h=await harness(t);await h.start();
  assert.deepEqual(h.buttons(),['确认安装','取消安装']);
  assert.match(h.model.summary.join('\n'),/在本机保存此应用的数据/);
  assert.match(h.model.summary.join('\n'),/已停用的应用更新后保持停用/);
  assert.deepEqual(h.model.technical,[h.row().subject.marketId,'SHA-256：'+await sidebarToolPackageHash(tool),'能力标识：storage.local']);
  await h.click('取消安装');assert.ok(h.row().cancelledAt);assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.closes,0);
  await h.click('完成');assert.equal(h.closes,1);
  await h.start();assert.equal(h.downloads,1);assert.match(h.message(),/已取消/);assert.ok(!h.buttons().includes('确认安装'));
});

test('cancellation failure keeps the window with explanation and retry/cancel controls',async t=>{
  const h=await harness(t);await h.start();h.cancelFails=true;await h.click('取消安装');
  assert.equal(h.closes,0);assert.equal(h.row().cancelledAt,undefined);
  assert.match(h.message(),/取消/);assert.deepEqual(h.buttons(),['重新加载审阅','取消安装']);
  h.cancelFails=false;await h.click('取消安装');assert.ok(h.row().cancelledAt);
});

test('download failures before consumption can reload review or cancel, including commit download failure',async t=>{
  const h=await harness(t);h.offline=true;await h.start();
  assert.deepEqual(h.buttons(),['重新加载审阅','取消安装']);assert.equal(h.row().consumedAt,null);
  h.offline=false;await h.click('重新加载审阅');assert.deepEqual(h.buttons(),['确认安装','取消安装']);
  h.offline=true;await h.click('确认安装');assert.equal(h.row().consumedAt,null);
  assert.deepEqual(h.buttons(),['重新加载审阅','取消安装']);await h.click('取消安装');assert.ok(h.row().cancelledAt);
});

test('confirmation redownload rejects changed bytes without consuming intent',async t=>{
  const h=await harness(t);await h.start();h.changed=true;await h.click('确认安装');
  assert.equal(h.downloads,2);assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.match(h.message(),/E_PACKAGE_IDENTITY/);
});

test('same-tool dirty state appearing during final identity check preserves the old installation',async t=>{
  const h=await harness(t),previous={...tool,version:'0.9.0'};
  h.values[SIDEBAR_TOOL_STORE]=[previous];
  let dirty=false,checks=0;
  h.assertOwner=async()=>{if(++checks===4)dirty=true;};
  h.assertCanInstall=id=>{assert.equal(id,tool.id);if(dirty)throw Error('当前应用有未保存内容，草稿已保留');};
  await h.start();await h.click('确认更新');
  assert.equal(dirty,true);assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[previous]);assert.match(h.message(),/草稿已保留/);
});

test('a saving Host blocks submission before a confirmation download',async t=>{
  const h=await harness(t);await h.start();
  h.assertCanInstall=()=>{throw Error('当前应用正在保存');};
  await h.click('确认安装');assert.equal(h.downloads,1);assert.equal(h.row().consumedAt,null);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.match(h.message(),/正在保存/);
});

test('one confirmation binds SHA, installs once, and offline reload recovers the same result',async t=>{
  const h=await harness(t);await h.start();await h.click('确认安装');
  assert.equal(h.row().sha256,await sidebarToolPackageHash(tool));assert.ok(h.row().settledAt);
  assert.equal(h.downloads,2);assert.match(h.message(),/安装完成/);
  const registryWrites=()=>h.writes.filter(write=>write[SIDEBAR_TOOL_STORE]).length;
  assert.equal(registryWrites(),1);h.offline=true;await h.start();
  assert.equal(h.downloads,2);assert.equal(registryWrites(),1);assert.match(h.message(),/安装完成/);
  assert.equal(h.closes,0);assert.deepEqual(h.opened,[]);
  await h.click('打开使用');assert.deepEqual(h.panelOpened,[{marketId:'opendesk/'+tool.id,id:tool.id,
     version:tool.version,sha256:await sidebarToolPackageHash(tool)}]);
  assert.deepEqual(h.opened,[]);assert.deepEqual(h.focused,[]);assert.equal(h.closes,1);
});

test('blocked in-panel opening keeps the installed result without another window or install',async t=>{
  const h=await harness(t);await h.start();await h.click('确认安装');
  const writes=h.writes.length;h.openApp=()=>false;
  await h.click('打开使用');assert.equal(h.closes,0);assert.deepEqual(h.opened,[]);
  assert.match(h.message(),/E_APP_OPEN_DEFERRED/);assert.equal(h.writes.length,writes);
  assert.ok(h.row().settledAt);assert.equal(h.downloads,2);
});

test('updating preserves application data and the disabled state with a single approval',async t=>{
  const h=await harness(t),dataKey=sidebarToolStorageKey(tool.id);
  h.values[SIDEBAR_TOOL_STORE]=[{...tool,version:'0.9.0'}];h.values[dataKey]={notes:['keep']};
  h.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};await h.start();
  assert.match(h.model.summary.join('\n'),/保留工具数据/);assert.deepEqual(h.buttons(),['确认更新','取消安装']);
  await h.click('确认更新');assert.deepEqual(h.values[dataKey],{notes:['keep']});
  assert.equal(h.values[SIDEBAR_TOOL_ENABLE_STORE][tool.id],false);assert.match(h.message(),/保持停用/);
  assert.deepEqual(h.buttons(),['完成']);assert.deepEqual(h.opened,[]);
  assert.deepEqual(h.panelOpened,[],'disabled apps must never be launched or silently enabled');
  const writes=h.writes.length;await h.click('完成');
  assert.equal(h.closes,1);assert.equal(h.writes.length,writes);
});

test('consumed request without journal closes only the handoff and remains unknown offline',async t=>{
  const h=await harness(t);await h.consume();h.offline=true;await h.start();
  assert.equal(h.downloads,0);assert.match(h.message(),/安装结果未知/);
  assert.ok(!h.buttons().some(label=>/确认安装|取消/.test(label)));
  await h.click('结束此交接（安装结果未知）');
  assert.equal(h.row().closureReason,'unknown-without-journal');assert.equal(h.row().cancelledAt,undefined);
  assert.equal((await readMarketInstallStatus(h.api,h.row())).installation,'unknown');
  assert.match(h.message(),/仍未知/);assert.deepEqual(h.buttons(),['完成']);
});

test('untouched historical page review migrates to trusted approval; consumed history ignores the old document',async t=>{
  const h=await harness(t);h.row().pageReview={documentId:'b'.repeat(32),tabId:99,token:randomUUID(),
    sha256:await sidebarToolPackageHash(tool),baselineHash:null,cancelledAt:null};
  await h.start();assert.equal(h.downloads,1);
  assert.deepEqual(h.buttons(),['确认安装','取消安装']);
  await h.consume();h.offline=true;await h.start();assert.equal(h.downloads,1);
  assert.ok(!h.buttons().some(label=>/确认安装|取消/.test(label)));
  await h.click('结束此交接（安装结果未知）');assert.equal(h.row().closureReason,'unknown-without-journal');
});

test('existing current installation is separate from this consumed request without a journal',async t=>{
  const h=await harness(t);await h.consume();h.values[SIDEBAR_TOOL_STORE]=[tool];
  h.values[MARKET_PROVENANCE_STORE]={[tool.id]:{marketId:h.row().subject.marketId,version:tool.version,sha256:await sidebarToolPackageHash(tool)}};
  await h.start();assert.match(h.message(),/安装结果未知/);assert.match(h.message(),/当前本机版本/);
  assert.ok(!h.buttons().includes('打开使用'));assert.equal(h.downloads,0);
});

test('recovery rejects mismatched journal identity without fetching or submitting again',async t=>{
  const h=await harness(t);await h.start();await h.click('确认安装');
  h.values[MARKET_OPERATIONS_STORE][h.row().operationId].marketId='opendesk/another-tool';
  h.offline=true;await h.start();assert.equal(h.downloads,2);
  assert.match(h.message(),/E_MARKET_IDENTITY/);assert.ok(!h.buttons().includes('打开使用'));
  assert.equal(h.writes.filter(write=>write[SIDEBAR_TOOL_STORE]).length,1);
});

test('unfinished provenance recovers offline without downloading or rewriting the installed package',async t=>{
  const h=await harness(t),set=h.api.storage.local.set;let fault=true;
  h.api.storage.local.set=async rows=>{
    if(fault&&rows[MARKET_PROVENANCE_STORE])throw Error('来源记录暂时不可写');
    await set(rows);
  };
  await h.start();await h.click('确认安装');assert.equal(h.closes,0);
  assert.ok(!h.buttons().includes('确认安装'));assert.ok(h.row().consumedAt);
  assert.equal(h.row().settledAt,null);fault=false;h.offline=true;await h.start();
  assert.equal(h.downloads,2);assert.match(h.message(),/安装完成/);assert.ok(h.row().settledAt);
  assert.equal(h.writes.filter(write=>write[SIDEBAR_TOOL_STORE]).length,1);
});

test('failed journal is explained and retained without cancellation or replay',async t=>{
  const h=await harness(t);await h.start();await h.click('确认安装');
  h.values[MARKET_OPERATIONS_STORE][h.row().operationId].state='failed';
  delete h.values[SIDEBAR_TOOL_STORE];delete h.values[MARKET_PROVENANCE_STORE];
  h.offline=true;await h.start();assert.match(h.message(),/安装失败/);
  assert.equal(h.downloads,2);assert.equal(h.closes,0);
  assert.deepEqual(h.buttons(),['核对原安装结果','稍后继续']);
  assert.equal(h.row().cancelledAt,undefined);
});

test('lost consume acknowledgement enters local recovery instead of offering another confirmation',async t=>{
  const h=await harness(t),set=h.api.storage.local.set;let fault=true;
  h.api.storage.local.set=async rows=>{
    await set(rows);
    if(fault&&rows[MARKET_INTENTS_STORE]?.intents[0]?.consumedAt){fault=false;throw Error('acknowledgement lost');}
  };
  await h.start();await h.click('确认安装');assert.ok(h.row().consumedAt);
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  assert.match(h.message(),/E_HANDOFF_UNKNOWN/);assert.ok(h.buttons().includes('结束此交接（安装结果未知）'));
  assert.ok(!h.buttons().some(label=>/确认安装|取消/.test(label)));
  h.offline=true;await h.start();assert.equal(h.downloads,2);
  await h.click('结束此交接（安装结果未知）');assert.equal(h.row().closureReason,'unknown-without-journal');
});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('dismiss closes the Sheet without cancelling or consuming the persisted request',async t=>{
  const h=await harness(t);await h.start();const before=structuredClone(h.row());
  assert.equal(h.ui.dismiss(),true);assert.equal(h.closes,1);
  assert.deepEqual(h.row(),before);assert.deepEqual(h.writes,[]);
  await h.ui.act('commit');await h.ui.act('cancel');
  assert.deepEqual(h.row(),before);assert.deepEqual(h.writes,[]);
  await h.start();assert.deepEqual(h.buttons(),['确认安装','取消安装']);
  assert.equal(h.row().consumedAt,null);assert.equal(h.row().cancelledAt,undefined);
});

test('dispose during candidate loading prevents publication and any installation submission',async t=>{
  const h=await harness(t),entered=deferred(),release=deferred();
  h.beforeLoad=async()=>{entered.resolve();await release.promise;};
  h.mount();await entered.promise;assert.equal(h.model.phase,'loading');
  h.ui.dispose();const publications=h.models.length;release.resolve();await h.ui.ready;
  await h.ui.act('commit');await h.ui.act('cancel');
  assert.equal(h.models.length,publications);assert.equal(h.closes,0);
  assert.equal(h.row().consumedAt,null);assert.equal(h.row().cancelledAt,undefined);
  assert.deepEqual(h.writes,[]);assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});

test('dispose during confirmation redownload prevents consume, journal and registry writes',async t=>{
  const h=await harness(t);await h.start();const entered=deferred(),release=deferred();
  h.beforeLoad=async()=>{entered.resolve();await release.promise;};
  const committing=h.ui.act('commit');await entered.promise;
  h.ui.dispose();const publications=h.models.length;release.resolve();await committing;
  assert.equal(h.models.length,publications);assert.equal(h.row().consumedAt,null);
  assert.equal(h.row().cancelledAt,undefined);assert.deepEqual(h.writes,[]);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});

test('concurrent actions while confirming produce exactly one consume and one package write',async t=>{
  const h=await harness(t);await h.start();const entered=deferred(),release=deferred();
  h.beforeLoad=async()=>{entered.resolve();await release.promise;};
  const committing=h.ui.act('commit');await entered.promise;assert.equal(h.model.busy,true);
  assert.equal(h.ui.dismiss(),false);assert.equal(h.closes,0);
  await Promise.all([h.ui.act('commit'),h.ui.act('cancel')]);
  assert.equal(h.row().consumedAt,null);assert.deepEqual(h.writes,[]);
  release.resolve();await committing;
  assert.equal(h.downloads,2);assert.equal(h.model.busy,false);
  assert.equal(h.writes.filter(write=>write[SIDEBAR_TOOL_STORE]).length,1);
  assert.equal(h.writes.filter(write=>write[MARKET_INTENTS_STORE]?.intents[0]?.consumedAt&&
    write[MARKET_INTENTS_STORE].intents[0].settledAt===null).length,1);
  assert.ok(h.row().settledAt);assert.equal(h.row().cancelledAt,undefined);
  assert.equal((await readMarketInstallStatus(h.api,h.row())).installation,'installed');
  assert.match(h.message(),/安装完成/);
});

test('owner lost after confirmation preflight is rejected at commit before consuming or writing',async t=>{
  const h=await harness(t);let owned=true,checks=0;
  h.assertOwner=async()=>{checks++;if(!owned)throw Object.assign(Error('审阅 owner 已失效'),{code:'E_REVIEW_OWNER'});};
  await h.start();assert.equal(checks,1);
  h.beforeLoad=async count=>{if(count===2)owned=false;};
  await h.click('确认安装');assert.equal(checks,3);
  assert.match(h.message(),/E_REVIEW_OWNER/);assert.equal(h.model.phase,'error');
  assert.equal(h.row().consumedAt,null);assert.equal(h.row().cancelledAt,undefined);
  assert.deepEqual(h.writes,[]);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.values[MARKET_PROVENANCE_STORE],undefined);
  assert.ok(!h.buttons().includes('打开使用'));assert.equal(h.closes,0);
});

test('legacy initMarketInstall only renders guidance and cannot approve or cancel installation',async t=>{
  const h=await harness(t),root=new Element('main'),before=structuredClone(h.row());
  const ui=initMarketInstall({root,api:h.api,lockManager:h.lockManager});await ui.ready;
  assert.match(root.textContent,/在侧边栏继续安装/);
  assert.match(root.textContent,/点击 OpenDesk 工具栏图标/);
  assert.match(root.textContent,/打开侧边栏不会批准安装/);
  assert.deepEqual(root.children.map(child=>child.tag),['h1','p']);
  assert.equal(root.children[1].attributes.role,'status');
  assert.ok(root.children.every(child=>Object.keys(child.listeners).length===0));
  assert.equal(ui.act,undefined);assert.equal(ui.dismiss,undefined);ui.dispose();
  assert.equal(h.downloads,0);assert.deepEqual(h.writes,[]);assert.deepEqual(h.row(),before);
  assert.deepEqual(h.opened,[]);assert.equal(h.closes,0);
});
