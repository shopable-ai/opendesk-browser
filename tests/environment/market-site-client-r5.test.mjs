// Public-client COMPONENT evidence; fake replies do not prove native installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readMarketInstallStatus} from '../../src/marketplace/status.js';
import {MARKET_OPERATIONS_STORE} from '../../src/ui/sidebar-tools/installation.js';
const script=await readFile('src/market-site/client.js','utf8');
const templates=await readFile('src/market-site/templates.mjs','utf8');
const protocol='opendesk.market.intent.v1',origin='http://127.0.0.1:43132';
const config={schema:'opendesk.market.channel.v1',protocol,enabled:true,extensionId:'a'.repeat(32),origin};
const app={kind:'app',marketId:'opendesk/markdown-workbench',version:'1.0.1'};
const key=subject=>'opendesk.market.intent:'+JSON.stringify(subject);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const current=(state='not-installed',extra={})=>({currentInstallation:state,
  installedVersion:state==='not-installed'?null:state==='installed'?app.version:'1.0.0',
  enabled:state==='not-installed'?null:true,...extra});
function client({receiver=true,configuration=config,fetchError=null,subjects=[app],storage=new Map()}={}){
  const nodes=new Map(),sent=[],posted=[],timers=new Map(),listeners=new Map();let sequence=0,time=1000000;
  function node(){return {textContent:'',disabled:false,hidden:false,dataset:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};}
  for(const name of ['#connection-state','#connect-button','#handoff-state','#handoff-details','#handoff-code'])nodes.set(name,node());
  const controls=subjects.map(subject=>{
    const button=node(),status=node(),back=node();button.dataset.subject=JSON.stringify(subject);
    button.textContent=subject.kind==='app'?'安装到OpenDesk':'打开 OpenDesk 安装审阅';
    button.parentElement={querySelector:selector=>({'[data-handoff-state]':status,'[data-return-review]':back})[selector]};
    return {button,status,back};
  });
  nodes.set('#open-review',controls[0].button);
  const window={addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    postMessage(...args){posted.push(args);}};
  const chrome={runtime:{...(receiver?{sendMessage(id,message,callback){sent.push({id,message,callback});}}:{})}};
  runInNewContext(script,{document:{querySelector:selector=>nodes.get(selector)||null,
    querySelectorAll:selector=>selector==='[data-open-review]'?controls.map(row=>row.button):[]},chrome,window,
    addEventListener:window.addEventListener,
    fetch:async()=>{if(fetchError)throw fetchError;return {ok:true,json:async()=>configuration};},location:{origin},crypto:{randomUUID},
    sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),URL,JSON,
    Date:class extends Date{static now(){return time;}}},
  {filename:'src/market-site/client.js'});
  const answer=(request,response,error=null)=>{
    assert.ok(request,'expected an external request');request.answered=true;
    if(error)chrome.runtime.lastError={message:error};request.callback(response);delete chrome.runtime.lastError;
  };
  const reply=(request,extra={})=>answer(request,{ok:true,protocol,
    ...({PROBE:{status:'CONNECTED'},
      GET_INSTALL_STATUS:{status:'INSTALL_STATUS',intentId:request.message.intentId,installation:'unknown',progress:null,...current()},
      OPEN_INSTALL_REVIEW:{status:'REVIEW_OPENED',intentId:request.message.intentId}}[request.message.action]),...extra});
  return {nodes,sent,posted,timers,listeners,storage,controls,answer,reply,
    advance:milliseconds=>time+=milliseconds,
    act:(index=0)=>controls[index].button.listeners.click(),back:(index=0)=>controls[index].back.listeners.click(),
    emit:name=>Promise.all([...(listeners.get(name)||[])].map(fn=>fn())),
    expire(){for(const [id,timer] of [...timers]){timers.delete(id);timer.fn();}}};
}
async function ready(h){
  // Complete connection probes and original transaction receipt recovery only.
  for(let turn=0;turn<64;turn++){
    await tick();
    for(const req of h.sent.filter(row=>!row.answered)){
      assert.ok(['PROBE','GET_INSTALL_STATUS'].includes(req.message.action));
      h.reply(req);
    }
  }
}
async function respond(h,promise,action,extra={}){
  await tick();const req=h.sent.at(-1);assert.equal(req.message.action,action);h.reply(req,extra);await promise;return req;
}
function whitelist(h){
  for(const {message,id} of h.sent){
    assert.equal(id,config.extensionId);assert.equal(message.protocol,protocol);
    const fields=message.action==='PROBE'?['protocol','action']:
      ['protocol','action','intentId','subject'];
    assert.deepEqual(Object.keys(message).sort(),fields.sort());
    assert.ok(['PROBE','GET_INSTALL_STATUS','OPEN_INSTALL_REVIEW'].includes(message.action));
  }
  assert.equal(h.posted.length,0,'no page REVIEW/PREPARE/COMMIT channel');
}
test('all apps request external review only; another click queries and explicit return reuses the intent',async()=>{
  const h=client();await ready(h);
  assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');
  const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  assert.deepEqual(JSON.parse(JSON.stringify(first.message.subject)),app);
  assert.match(h.controls[0].status.textContent,/不表示已安装/);
  assert.equal(h.controls[0].back.hidden,false);
  await respond(h,h.act(),'GET_INSTALL_STATUS');
  assert.match(h.controls[0].status.textContent,/结果未知/);
  const back=await respond(h,h.back(),'OPEN_INSTALL_REVIEW');
  assert.equal(back.message.intentId,first.message.intentId);
  assert.deepEqual(JSON.parse(h.storage.get(key(app))).subject,app);
  whitelist(h);
});
test('unknown timeout persists before sending, then primary click only queries',async()=>{
  const h=client();await ready(h);const action=h.act();await tick();const first=h.sent.at(-1);
  assert.equal(first.message.action,'OPEN_INSTALL_REVIEW');
  assert.equal(JSON.parse(h.storage.get(key(app))).id,first.message.intentId);
  h.expire();await action;
  assert.equal(h.controls[0].status.dataset.state,'error');
  assert.equal(h.controls[0].back.hidden,false);
  const query=await respond(h,h.act(),'GET_INSTALL_STATUS');assert.equal(query.message.intentId,first.message.intentId);
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  whitelist(h);
});
test('refresh, focus, pageshow and reconnect only recover the fixed session intent',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  const restored=client({storage:h.storage});await ready(restored);
  assert.equal(restored.sent.find(row=>row.message.action==='GET_INSTALL_STATUS').message.intentId,first.message.intentId);
  for(const event of ['focus','pageshow']){
    restored.advance(16000);
    const before=restored.sent.length;restored.emit(event);await ready(restored);
    assert.deepEqual(restored.sent.slice(before).map(row=>row.message.action),['GET_INSTALL_STATUS']);
  }
  restored.nodes.get('#connect-button').listeners.click();await ready(restored);
  assert.ok(restored.sent.every(row=>['PROBE','GET_INSTALL_STATUS'].includes(row.message.action)));
  assert.match(restored.controls[0].status.textContent,/结果未知/);whitelist(restored);
});
test('cancellation clears session and a later explicit install creates a new intent',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'cancelled'});
  assert.equal(h.storage.has(key(app)),false);assert.equal(h.controls[0].back.hidden,true);
  assert.match(h.controls[0].status.textContent,/已取消/);
  const second=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');assert.notEqual(first.message.intentId,second.message.intentId);
  whitelist(h);
});
test('website never queries current app state or opens apps on load, focus, pageshow or reconnect',async()=>{
  const subjects=Array.from({length:13},(_,index)=>({...app,marketId:'opendesk/card-'+String.fromCharCode(97+index)}));
  const h=client({subjects});await ready(h);
  assert.deepEqual(h.sent.map(row=>row.message.action),['PROBE']);
  for(const event of ['focus','pageshow']){
    h.advance(16000);h.emit(event);await ready(h);
    assert.deepEqual(h.sent.map(row=>row.message.action),['PROBE']);
  }
  h.nodes.get('#connect-button').listeners.click();await ready(h);
  assert.deepEqual(h.sent.map(row=>row.message.action),['PROBE','PROBE']);
  assert.ok(h.controls.every(row=>row.button.textContent==='安装到OpenDesk'));
  assert.doesNotMatch(script,/GET_APP_STATUS|OPEN_INSTALLED_APP/);
  whitelist(h);
});

test('an older installed release in an unknown handoff does not change public CTA',async()=>{
  const h=client();await ready(h);
  await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'unknown',...current('update-available')});
  assert.match(h.controls[0].status.textContent,/本次安装结果未知/);
  assert.equal(h.controls[0].button.textContent,'核对安装结果');
  assert.notEqual(h.controls[0].status.dataset.state,'success');
  assert.equal(h.sent.some(row=>row.message.action==='OPEN_INSTALLED_APP'),false);
  whitelist(h);
});

test('installing uses public copy and only matching installed operation result reports success',async()=>{
  const h=client();await ready(h);await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'installing',progress:'committing'});
  assert.match(h.controls[0].status.textContent,/正在安装/);
  assert.doesNotMatch(h.controls[0].status.textContent,/committing/);
  assert.equal(h.controls[0].button.textContent,'核对安装结果');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'installed',...current('installed')});
  assert.equal(h.controls[0].status.dataset.state,'success');assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');
  assert.equal(h.storage.has(key(app)),false,'successful receipt does not become a session installed cache');
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  whitelist(h);
});
test('malformed or mismatched status replies never turn unknown operation into success',async()=>{
  for(const bad of [{protocol:'unknown.v0'},{intentId:randomUUID()},{installation:'success'},
    {installation:'installed',...current()},{installation:'installed',...current('different-version')},
    {currentInstallation:'yes'},{installedVersion:42},{enabled:'true'},{progress:{text:'done'}},{handoff:'approved'},{handoff:null}]){
    const h=client();await ready(h);await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
    const action=h.act();await tick();h.reply(h.sent.at(-1),bad);await action;
    assert.equal(h.controls[0].status.dataset.state,'error');assert.equal(h.controls[0].button.textContent,'核对安装结果');
    assert.equal(h.controls[0].back.hidden,false);whitelist(h);
  }
});
test('an older failed probe cannot overwrite a newer successful reconnect',async()=>{
  const h=client();await tick();const oldProbe=h.sent[0];
  h.nodes.get('#connect-button').listeners.click();await tick();
  const nextProbe=h.sent.at(-1);assert.equal(nextProbe.message.action,'PROBE');
  h.reply(nextProbe);await ready(h);
  assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');
  h.answer(oldProbe,undefined,'old receiver failure');await tick();
  assert.equal(h.nodes.get('#connection-state').textContent,'已连接 OpenDesk');
  assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');whitelist(h);
});
test('fixed releases have independent session intents and messages carry only their own subject',async()=>{
  const other={...app,version:'1.0.2'},h=client({subjects:[app,other]});await ready(h);
  const first=await respond(h,h.act(0),'OPEN_INSTALL_REVIEW');
  const second=await respond(h,h.act(1),'OPEN_INSTALL_REVIEW');
  assert.notEqual(first.message.intentId,second.message.intentId);
  assert.deepEqual(JSON.parse(JSON.stringify(second.message.subject)),other);assert.equal(h.storage.size,2);whitelist(h);
});
test('tampered cross-subject session record is ignored',async()=>{
  const storage=new Map([[key(app),JSON.stringify({id:randomUUID(),subject:{...app,version:'9.0.0'}})]]);
  const h=client({storage});await ready(h);
  assert.equal(h.sent.some(row=>row.message.action==='GET_INSTALL_STATUS'),false);
  await respond(h,h.act(),'OPEN_INSTALL_REVIEW');whitelist(h);
});
test('collection retains external review and read-only status recovery',async()=>{
  const subject={kind:'collection',collectionId:'reading-kit',revision:2},h=client({subjects:[subject]});await ready(h);
  const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'review'});
  const back=await respond(h,h.back(),'OPEN_INSTALL_REVIEW');assert.equal(back.message.intentId,first.message.intentId);
  assert.equal(h.sent.some(row=>row.message.action==='GET_APP_STATUS'),false);whitelist(h);
});
test('missing receiver and channel errors never claim installation or send fallback page messages',async()=>{
  const absent=client({receiver:false});await tick();await absent.act();
  assert.match(absent.controls[0].status.textContent,/无法连接 OpenDesk/);assert.equal(absent.sent.length,0);
  for(const options of [{fetchError:new TypeError('Failed to fetch')},{configuration:null},
    {configuration:{...config,origin:'http://127.0.0.1:43133'}},{configuration:{...config,enabled:false}}]){
    const h=client(options);await tick();await h.act();assert.equal(h.sent.length,0);assert.equal(h.posted.length,0);
    assert.equal(h.controls[0].status.dataset.state,'error');assert.doesNotMatch(h.controls[0].status.textContent,/TypeError|SyntaxError/);
  }
});
test('backend recovered intent replaces the proposed ID for session, queries, return and refresh',async()=>{
  const h=client();await ready(h);const recovered=randomUUID();
  const proposed=await respond(h,h.act(),'OPEN_INSTALL_REVIEW',{intentId:recovered});
  assert.notEqual(proposed.message.intentId,recovered);
  assert.equal(JSON.parse(h.storage.get(key(app))).id,recovered);
  const query=await respond(h,h.act(),'GET_INSTALL_STATUS');assert.equal(query.message.intentId,recovered);
  const back=await respond(h,h.back(),'OPEN_INSTALL_REVIEW',{intentId:recovered});assert.equal(back.message.intentId,recovered);
  const restored=client({storage:h.storage});await ready(restored);
  assert.equal(restored.sent.find(row=>row.message.action==='GET_INSTALL_STATUS').message.intentId,recovered);
  whitelist(h);whitelist(restored);
});
test('legacy fixed-key session intent remains queryable after expiry without silently replacing it',async()=>{
  const id=randomUUID(),storage=new Map([[key(app),JSON.stringify({id,expiresAt:1})]]);
  const h=client({storage});await ready(h);
  assert.equal(h.sent.find(row=>row.message.action==='GET_INSTALL_STATUS').message.intentId,id);
  const query=await respond(h,h.act(),'GET_INSTALL_STATUS');assert.equal(query.message.intentId,id);
  assert.equal(h.sent.some(row=>row.message.action==='OPEN_INSTALL_REVIEW'),false);whitelist(h);
});
test('an explicitly ended unknown handoff permits only a later user initiated review',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'unknown',handoffClosed:true});
  assert.equal(h.storage.has(key(app)),false);assert.equal(h.controls[0].back.hidden,true);
  assert.match(h.controls[0].status.textContent,/原安装结果仍未知/);
  assert.notEqual(h.controls[0].status.dataset.state,'success');
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  const second=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');assert.notEqual(first.message.intentId,second.message.intentId);
  whitelist(h);
});

test('unread successful receipt followed by uninstall and refresh clears only the old transaction, without replay',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  const operationId=randomUUID(),sha256='a'.repeat(64);
  // The original journal acknowledged success; the package and provenance have since been removed.
  const stored={[MARKET_OPERATIONS_STORE]:{[operationId]:{state:'succeeded',toolId:'markdown-workbench',
    marketId:app.marketId,version:app.version,sha256}}};
  const receipt=await readMarketInstallStatus({storage:{local:{get:async()=>stored}}},
    {subject:app,operationId,sha256,consumedAt:1,settledAt:2,closureReason:'journal-terminal'});
  const restored=client({storage:h.storage});await tick();restored.reply(restored.sent[0]);await tick();
  const query=restored.sent.at(-1);assert.equal(query.message.action,'GET_INSTALL_STATUS');
  assert.equal(query.message.intentId,first.message.intentId);restored.reply(query,receipt);await tick();
  assert.equal(restored.storage.has(key(app)),false);
  assert.equal(restored.controls[0].button.textContent,'安装到OpenDesk');
  assert.equal(restored.controls[0].back.hidden,true);
  assert.match(restored.controls[0].status.textContent,/原安装事务已成功结束.*当前应用已移除.*再次点击安装/);
  assert.notEqual(restored.controls[0].status.dataset.state,'success');
  const before=restored.sent.length;restored.emit('focus');restored.emit('pageshow');await ready(restored);
  assert.equal(restored.sent.length,before,'terminal receipt recovery stops querying without automatic review');
  const second=await respond(restored,restored.act(),'OPEN_INSTALL_REVIEW');
  assert.notEqual(second.message.intentId,first.message.intentId);
  whitelist(h);whitelist(restored);
});
test('an expired unsubmitted request clears the session without claiming its result or automatically retrying',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  const checking=h.act();await tick();
  h.answer(h.sent.at(-1),{ok:false,protocol,error:{code:'E_INTENT_EXPIRED',message:'此安装请求不存在或已过期。'}});await checking;
  assert.equal(h.storage.has(key(app)),false);assert.equal(h.controls[0].back.hidden,true);
  assert.match(h.controls[0].status.textContent,/原请求结果未在此确认/);
  assert.notEqual(h.controls[0].status.dataset.state,'success');
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  const second=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');assert.notEqual(first.message.intentId,second.message.intentId);
  whitelist(h);
});
test('existing installation never converts an unresolved receipt into success or an open action',async()=>{
  const h=client();await ready(h);await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'unknown',...current('installed')});
  assert.match(h.controls[0].status.textContent,/本次安装结果未知/);
  assert.equal(h.controls[0].button.textContent,'核对安装结果');
  assert.notEqual(h.controls[0].status.dataset.state,'success');
  assert.equal(h.sent.some(row=>row.message.action==='OPEN_INSTALLED_APP'),false);
  whitelist(h);
});
test('malformed external review receipt cannot erase the queryable proposed intent',async()=>{
  for(const bad of [{intentId:undefined},{intentId:'not-an-intent'},{status:'INSTALLED'},{protocol:'unknown.v0'},{ok:1}]){
    const h=client();await ready(h);const action=h.act();await tick();const request=h.sent.at(-1);h.reply(request,bad);await action;
    assert.equal(h.controls[0].status.dataset.state,'error');
    assert.equal(JSON.parse(h.storage.get(key(app))).id,request.message.intentId);
    await respond(h,h.act(),'GET_INSTALL_STATUS');whitelist(h);
  }
});
test('successful transaction receipt is cleared on return and never restored as current installed state',async()=>{
  for(const event of ['focus','pageshow']){
    const h=client();await ready(h);await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
    await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'installed',...current('installed')});
    assert.match(h.controls[0].status.textContent,/本次安装成功.*本次事务回执.*不代表当前仍已安装.*侧边栏核对并打开使用/);
    assert.equal(h.storage.has(key(app)),false);
    assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');
    const before=h.sent.length;
    h.emit(event);await ready(h);
    assert.equal(h.sent.length,before);
    assert.equal(h.controls[0].status.hidden,true);
    assert.equal(h.controls[0].status.textContent,'');
    assert.notEqual(h.controls[0].status.dataset.state,'success');
    const restored=client({storage:h.storage});await ready(restored);
    assert.equal(restored.controls[0].button.textContent,'安装到OpenDesk');
    assert.doesNotMatch(restored.controls[0].status.textContent,/安装成功|已安装/);
    assert.deepEqual(restored.sent.map(row=>row.message.action),['PROBE']);
    whitelist(h);whitelist(restored);
  }
});

test('legacy terminal receipts are discarded without querying or claiming current installation',async()=>{
  for(const installation of ['installed','cancelled','failed']){
    const storage=new Map([[key(app),JSON.stringify({id:randomUUID(),subject:app,installation})]]);
    const h=client({storage});await ready(h);
    assert.deepEqual(h.sent.map(row=>row.message.action),['PROBE']);
    assert.equal(storage.has(key(app)),false);
    assert.equal(h.controls[0].button.textContent,'安装到OpenDesk');
    assert.doesNotMatch(h.controls[0].status.textContent,/成功|已安装/);whitelist(h);
  }
});

test('double clicks and return events during review handoff cannot duplicate the request',async()=>{
  const h=client();await ready(h);
  const first=h.act(),second=h.act(),back=h.back();await tick();
  assert.equal(h.controls[0].button.disabled,true);assert.equal(h.controls[0].back.disabled,true);
  h.emit('focus');h.emit('pageshow');await tick();
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  assert.equal(h.sent.filter(row=>row.message.action==='GET_INSTALL_STATUS').length,0);
  h.reply(h.sent.at(-1));await Promise.all([first,second,back]);
  assert.equal(h.controls[0].button.disabled,false);assert.equal(h.controls[0].back.disabled,false);
  whitelist(h);
});

test('automatic pending reads are bounded while explicit result queries still work',async()=>{
  const subjects=Array.from({length:13},(_,index)=>({...app,marketId:'opendesk/card-'+String.fromCharCode(97+index)}));
  const storage=new Map(subjects.map(subject=>[key(subject),JSON.stringify({id:randomUUID(),subject})]));
  const h=client({subjects,storage});await ready(h);
  for(let index=0;index<3;index++){h.advance(16000);h.emit('focus');await ready(h);}
  assert.equal(h.sent.filter(row=>row.message.action==='GET_INSTALL_STATUS').length,24);
  await respond(h,h.act(),'GET_INSTALL_STATUS');assert.equal(h.sent.at(-1).message.action,'GET_INSTALL_STATUS');whitelist(h);
});

test('app review handoffs accept opened, required and pending panel receipts without claiming approval or installation',async()=>{
  for(const status of ['REVIEW_OPENED','PANEL_REQUIRED','REVIEW_PENDING']){
    const h=client();await ready(h);const recovered=randomUUID();
    await respond(h,h.act(),'OPEN_INSTALL_REVIEW',{status,intentId:recovered});
    assert.equal(JSON.parse(h.storage.get(key(app))).id,recovered);
    assert.equal(h.controls[0].status.dataset.state,'pending');
    assert.match(h.controls[0].status.textContent,/侧边栏安装面板/);
    assert.match(h.controls[0].status.textContent,/打开面板不表示已批准/);
    if(status==='PANEL_REQUIRED'){
      assert.match(h.controls[0].status.textContent,/请求已保留.*点击 OpenDesk 工具栏继续安装.*在侧边栏处理当前审阅/);
      assert.doesNotMatch(h.controls[0].status.textContent,/已打开/);
    }else if(status==='REVIEW_PENDING'){
      assert.match(h.controls[0].status.textContent,/正在打开 OpenDesk 侧边栏安装面板/);
      assert.doesNotMatch(h.controls[0].status.textContent,/已打开|点击 OpenDesk 工具栏/);
    }else assert.match(h.controls[0].status.textContent,/已打开 OpenDesk 侧边栏安装面板/);
    const query=await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'review',handoff:'panel-required'});
    assert.equal(query.message.intentId,recovered);
    assert.match(h.controls[0].status.textContent,/点击 OpenDesk 工具栏继续安装/);
    assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
    const back=await respond(h,h.back(),'OPEN_INSTALL_REVIEW',{status});
    assert.equal(back.message.intentId,recovered);whitelist(h);
  }
});
test('restored panel handoff status only queries the original intent and keeps unknown results truthful',async()=>{
  for(const installation of ['review','unknown'])for(const handoff of ['panel-required','panel-open']){
    const id=randomUUID(),storage=new Map([[key(app),JSON.stringify({id,subject:app})]]),h=client({storage});
    await tick();h.reply(h.sent[0]);await tick();
    const query=h.sent.at(-1);assert.equal(query.message.action,'GET_INSTALL_STATUS');
    assert.equal(query.message.intentId,id);h.reply(query,{installation,handoff});await tick();
    assert.match(h.controls[0].status.textContent,/侧边栏安装面板.*打开面板不表示已批准/);
    if(handoff==='panel-required')assert.match(h.controls[0].status.textContent,/点击 OpenDesk 工具栏继续安装/);
    if(installation==='unknown')assert.match(h.controls[0].status.textContent,/本次安装结果未知/);
    assert.equal(h.controls[0].status.dataset.state,'pending');
    h.advance(16000);h.emit('focus');await ready(h);
    await respond(h,h.act(),'GET_INSTALL_STATUS',{installation,handoff});
    assert.ok(h.sent.every(row=>['PROBE','GET_INSTALL_STATUS'].includes(row.message.action)));
    assert.equal(JSON.parse(storage.get(key(app))).id,id);whitelist(h);
  }
});
test('collection rejects app-only required and pending panel receipts and retains the same queryable intent',async()=>{
  for(const status of ['PANEL_REQUIRED','REVIEW_PENDING']){
  const subject={kind:'collection',collectionId:'reading-kit',revision:2},h=client({subjects:[subject]});await ready(h);
  const request=await respond(h,h.act(),'OPEN_INSTALL_REVIEW',{status});
  assert.equal(h.controls[0].status.dataset.state,'error');
  const query=await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'review'});
  assert.equal(query.message.intentId,request.message.intentId);
  assert.match(h.controls[0].status.textContent,/OpenDesk 审阅页/);
  assert.doesNotMatch(h.controls[0].status.textContent,/侧边栏安装面板|工具栏/);whitelist(h);
  }
});

test('pending receipt survives refresh with backend status lacking handoff and never reopens automatically',async()=>{
  const h=client();await ready(h);
  const request=await respond(h,h.act(),'OPEN_INSTALL_REVIEW',{status:'REVIEW_PENDING'});
  assert.equal(h.controls[0].status.dataset.state,'pending');
  assert.doesNotMatch(h.controls[0].status.textContent,/已打开/);
  const restored=client({storage:h.storage});await ready(restored);
  const query=restored.sent.find(row=>row.message.action==='GET_INSTALL_STATUS');
  assert.equal(query.message.intentId,request.message.intentId);
  await respond(restored,restored.act(),'GET_INSTALL_STATUS',{installation:'review'});
  assert.match(restored.controls[0].status.textContent,/请在 OpenDesk 侧边栏安装面板 中核对并确认/);
  assert.doesNotMatch(restored.controls[0].status.textContent,/已打开/);
  assert.equal(restored.controls[0].status.dataset.state,'pending');
  restored.advance(16000);restored.emit('focus');await ready(restored);
  assert.ok(restored.sent.every(row=>['PROBE','GET_INSTALL_STATUS'].includes(row.message.action)));
  const back=await respond(restored,restored.back(),'OPEN_INSTALL_REVIEW',{status:'REVIEW_PENDING'});
  assert.equal(back.message.intentId,request.message.intentId);
  assert.match(restored.controls[0].status.textContent,/正在打开 OpenDesk 侧边栏安装面板/);
  assert.doesNotMatch(restored.controls[0].status.textContent,/点击 OpenDesk 工具栏/);
  whitelist(h);whitelist(restored);
});

test('original receipts never project installed, disabled or other-version state onto public CTA',async()=>{
  for(const state of ['installed','update-available','different-version'])for(const enabled of [true,false]){
    const h=client();await ready(h);await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
    await respond(h,h.act(),'GET_INSTALL_STATUS',{installation:'unknown',...current(state,{enabled})});
    assert.equal(h.controls[0].button.textContent,'核对安装结果');
    assert.match(h.controls[0].status.textContent,/本次安装结果未知/);
    assert.notEqual(h.controls[0].status.dataset.state,'success');whitelist(h);
  }
});

test('receiver disconnect preserves the original uncertain intent and never resubmits it',async()=>{
  const h=client();await ready(h);const first=await respond(h,h.act(),'OPEN_INSTALL_REVIEW');
  const checking=h.act();await tick();h.answer(h.sent.at(-1),undefined,'No receiver');await checking;
  assert.equal(h.controls[0].button.textContent,'核对安装结果');
  assert.equal(JSON.parse(h.storage.get(key(app))).id,first.message.intentId);
  assert.match(h.controls[0].status.textContent,/无法连接 OpenDesk/);
  assert.match(h.nodes.get('#connection-state').textContent,/连接不可用/);
  const query=await respond(h,h.act(),'GET_INSTALL_STATUS');
  assert.equal(query.message.intentId,first.message.intentId);
  assert.equal(h.sent.filter(row=>row.message.action==='OPEN_INSTALL_REVIEW').length,1);
  whitelist(h);
});

test('public templates direct app use to Side Panel and describe only original transaction recovery',()=>{
  assert.doesNotMatch(templates,/data-open-installed|或「更新」/);
  assert.match(templates,/安装后请在 OpenDesk 侧边栏打开使用/);
  assert.match(templates,/网页仅展示本次安装事务回执，不同步当前安装状态/);
  assert.match(templates,/仅恢复未结束的原事务回执/);
});

test('market public install chain does not require native desktop messaging',async()=>{
  const [external,install,distribution]=await Promise.all([
    readFile('src/marketplace/external.js','utf8'),readFile('src/marketplace/install.js','utf8'),
    readFile('src/marketplace/distribution.js','utf8')]);
  for(const src of [script,external,install,distribution]){
    assert.doesNotMatch(src,/chrome\.runtime\.(?:connectNative|sendNativeMessage)\s*\(/);
    assert.doesNotMatch(src,/nativeMessaging|127\.0\.0\.1:43132\/desktop/);
  }
});
