import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunContext} from '../../src/framework/context.js';
import {PageError, encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {createControllerDriver} from '../../src/framework/control/native-driver.js';
import {installPackagedPageSession} from '../../src/scripting/packaged/page-session.js';
import {createLocatorDescriptor, validateLocatorDescriptor} from '../../src/framework/control/locator-contract.js';
import {locate, accessibleName, semanticRole} from '../../src/scripting/packaged/locator-dom.js';

const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const target = {mode:'borrowed',tabId:17,frameId:0,documentId:'doc-A',allowedOrigin:'https://example.test',
  url:'https://example.test/form',browserSessionIncarnation:'browser-A',targetVersion:3};
const identity = {tag:'controller-run',runId:'modern-run',ownerEpoch:2,hostInstanceId:'host-A',
  hostDocumentId:'host-doc',target};
const revision = {scriptId:'modern-script',revision:1,sourceHash:'a'.repeat(64),pinKey:'pin:modern'};

class Element {
  constructor(tagName, attrs = {}, text = '') {
    this.tagName=tagName.toUpperCase(); this.nodeType=1; this.attrs={...attrs};
    this.children=[]; this.parentElement=null; this.isConnected=true; this.textContent=text;
    this.id=attrs.id || ''; this.type=attrs.type || (tagName === 'input' ? 'text' : '');
    this.value=attrs.value || ''; this.labels=[]; this.disabled=false; this.readOnly=false;
    if(this.tagName==='INPUT' && ['checkbox','radio'].includes(this.type)) this.checked=Boolean(attrs.checked);
    this.events=[]; this.box={left:10,top:10,width:130,height:28,right:140,bottom:38};
  }
  getAttribute(name) { return Object.hasOwn(this.attrs,name) ? this.attrs[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs,name); }
  setAttribute(name,value) { this.attrs[name]=String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  append(child) { child.parentElement=this;this.children.push(child);return child; }
  replaceWith(next) {
    const old=this.parentElement, i=old.children.indexOf(this);
    old.children[i]=next;next.parentElement=old;this.isConnected=false;
  }
  contains(other) { for(let el=other;el;el=el.parentElement) if(el===this)return true; return false; }
  getBoundingClientRect() { return this.box; }
  get size() { return 1; }
  get innerText() { return this.textContent; }
  get options() { return this.children.filter(el=>el.tagName==='OPTION'); }
  matches(selector) { return selector===':disabled' && this.disabled; }
  closest(selector) {
    const tags=selector.split(',').map(x=>x.trim());
    for(let el=this;el;el=el.parentElement) if(tags.some(s=>s===el.tagName.toLowerCase() ||
      s==='[role="dialog"]' && el.getAttribute('role')==='dialog' ||
      s==='[aria-disabled="true"]' && el.getAttribute('aria-disabled')==='true' ||
      s==='[inert]' && el.hasAttribute('inert'))) return el;
    return null;
  }
  querySelectorAll(selector) { return descendants(this).filter(el=>matchSelector(el,selector)); }
  dispatchEvent(event) { this.events.push(event.type); this.onEvent?.(event); return true; }
  focus() { this.focuses=(this.focuses||0)+1; }
  click() {
    this.clicks=(this.clicks||0)+1;
    if(this.tagName==='INPUT'&&this.type==='checkbox') this.checked=!this.checked;
    if(this.tagName==='INPUT'&&this.type==='radio') this.checked=true;
    this.onClick?.();
  }
}
function descendants(root) {
  const all=[];for(const child of root.children){all.push(child,...descendants(child));}return all;
}
function matchSelector(el,css) {
  if(css==='*')return true;
  if(css.startsWith('#'))return el.id===css.slice(1);
  if(css==='label[for]')return el.tagName==='LABEL'&&el.hasAttribute('for');
  const id=css.match(/^\[id="([^"]+)"\]$/);
  if(id)return el.id===id[1];
  const testId=css.match(/^\[data-testid="([^"]+)"\]$/);
  if(testId)return el.getAttribute('data-testid')===testId[1];
  return el.tagName.toLowerCase()===css.toLowerCase();
}
function pageDOM() {
  const body=new Element('body'), form=body.append(new Element('form',{id:'search-form'}));
  const label=form.append(new Element('label',{for:'keyword'},'搜索关键词'));
  label.htmlFor='keyword';
  const input=form.append(new Element('input',{id:'keyword',type:'search',value:'旧内容'}));
  input.labels=[label];input.box={left:10,top:10,width:200,height:28,right:210,bottom:38};
  const button=form.append(new Element('button',{id:'search-submit'},'搜索'));
  button.box={left:10,top:60,width:100,height:32,right:110,bottom:92};
  const status=body.append(new Element('p',{role:'status',hidden:''},''));
  const result=body.append(new Element('div',{id:'results'},''));
  let submitCount=0, renderCount=0;
  function installButton(el) {
    el.onClick=()=>{ ++submitCount;status.textContent='搜索完成';status.removeAttribute('hidden');
      result.textContent='结果：'+input.value; };
  }
  installButton(button);
  input.onEvent=event=>{
    if(event.type!=='input')return;
    const old=form.children.find(x=>x.id==='search-submit');
    const fresh=new Element('button',{id:'search-submit'},'搜索');
    fresh.box={...button.box};fresh.disabled=true;installButton(fresh);
    old.replaceWith(fresh);++renderCount;
    setTimeout(()=>{fresh.disabled=false;},25);
    status.setAttribute('hidden','');
  };
  const doc={location:{href:target.url},visibilityState:'visible',body,defaultView:null,
    querySelectorAll(css){return [body,...descendants(body)].filter(el=>matchSelector(el,css));},
    getElementById(id){return [body,...descendants(body)].find(el=>el.id===id)||null;},
    elementFromPoint(x,y) {return [input,...form.children.filter(el=>['BUTTON','INPUT','SELECT'].includes(el.tagName))].find(el=>{
      const r=el.box;return x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;
    }) || body;}
  };
  const win=new EventTarget();win.location={href:target.url};win.innerWidth=800;win.innerHeight=600;
  win.getComputedStyle=el=>({display:'block',visibility:'visible',
    pointerEvents:el.getAttribute('data-pointer-events') === 'none' ? 'none' : 'auto'});
  win.requestAnimationFrame=cb=>queueMicrotask(cb);win.Event=Event;
  win.HTMLInputElement=class {};win.HTMLTextAreaElement=class {};
  doc.defaultView=win;
  return {doc,win,body,form,label,input,status,result,
    get button(){return form.children.find(x=>x.id==='search-submit');},
    get submits(){return submitCount;},get renders(){return renderCount;}};
}
function eventBus() {
  const listeners=new Set();
  return {addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);},
    async deliver(message) {
      return new Promise(resolve=>{
        for(const fn of listeners)if(fn(message,{id:'ext',url:'chrome-extension://ext/background.html'},resolve))return;
      });
    }};
}
function fixture({afterPrepare,dropCommit=false,stallPrepare=false,duplicateCommit=false,deadlineMs=2000}={}) {
  const dom=pageDOM(), bus=eventBus(), calls=[], phases=[];
  let granted=true, changed=false, commits=0, writes=0;
  const receipts=[];
  const api={runtime:{id:'ext',onMessage:bus,getURL:path=>'chrome-extension://ext/'+path},
    tabs:{sendMessage(_tab,message,exact,callback){
      assert.deepEqual(exact,{documentId:target.documentId,frameId:0});
      calls.push(message.action==='execute'?message.envelope.operation.method:message.action);
      if(message.action==='execute' && message.envelope.operation.method==='locatorCommit') commits++;
      bus.deliver(message).then(reply=>{
        if(message.action==='execute' && message.envelope.operation.method==='locatorPrepare') {
          if(afterPrepare) { granted=false; }
          if(stallPrepare) return; // Read-only RPC callback is lost.
        }
        if(message.action==='execute' && message.envelope.operation.method==='locatorCommit' && duplicateCommit)
          bus.deliver(message).then(()=>{}); // A duplicate native delivery must reuse the existing commit result.
        if (!dropCommit || message.action!=='execute' || message.envelope.operation.method!=='locatorCommit') callback(reply);
      });
    }},
    webNavigation:{getAllFrames(_opts,callback){callback([{frameId:0,documentId:changed?'doc-B':'doc-A',
      documentLifecycle:'active',url:target.url}]);}},
    scripting:{executeScript(_opts,callback){callback([{frameId:0,documentId:'doc-A'}]);}}};
  const installation=installPackagedPageSession({api,document:dom.doc,window:dom.win,packageURLs:[]});
  const driver=createControllerDriver({api,authorize:async (_env,{phase})=>{
    phases.push(phase);if(!granted)throw new PageError('E_PERMISSION');return true;
  },withWrite:async (_owner,fn)=>{writes++;return fn();}});
  const transport={request:envelope=>driver.execute(envelope,{deadlineAt:Date.now()+deadlineMs,
    recordReceipt:receipt=>{receipts.push(receipt);}})};
  const context=createRunContext({identity,revision,target,transport,dom:null});
  return {dom,bus,calls,phases,receipts,context,installation,
    get commits(){return commits;},get writes(){return writes;},
    setDocument(value){changed=value;},revoke(){granted=false;},
    dispose(){context.dispose();installation.dispose();}};
}

test('modern Locator construction is immutable, scoped, and does not issue RPC',async()=>{
  const f=fixture();
  try {
    const scope=f.context.page.locator('#search-form');
    const l=scope.getByLabel('搜索关键词',{exact:true});
    assert.equal(Object.isFrozen(l),true);
    assert.equal(f.calls.length,0);
    assert.equal(await l.count(),1);
    assert.equal(await f.context.page.getByRole('button',{name:'搜索',exact:true}).count(),1);
    assert.equal(await f.context.page.getByTestId('not-found').count(),0);
    assert.throws(()=>f.context.page.getByRole('button',{name:/搜索/}),{code:'E_ARGUMENT_TYPE'});
    assert.throws(()=>f.context.page.locator('xpath=//input'),{code:'E_SELECTOR_UNSUPPORTED'});
    assert.throws(()=>f.context.page.getByRole('treegrid'),{code:'E_ROLE_UNSUPPORTED'});
  } finally {f.dispose();}
});
test('shared role, accessible name, observation and verified locator',async()=>{
  const f=fixture();
  try {
    const {doc,input}=f.dom;
    assert.equal(semanticRole(input),'searchbox');
    assert.equal(accessibleName(input,doc),'搜索关键词');
    assert.equal(locate(doc,createLocatorDescriptor('label','搜索关键词',{exact:true}))[0],input);
    const observed=await f.context.page.observe({root:'body',maxDepth:5,maxNodes:50,maxChars:4000});
    assert.equal(observed.kind,'semantic-dom-summary');
    assert.equal(observed.document.documentId,'doc-A');
    const button=observed.nodes.find(row=>row.role==='button'&&row.name==='搜索');
    assert.ok(button?.locator);
    assert.equal(locate(doc,button.locator).length,1);
    const limited=await f.context.page.observe({maxNodes:1});
    assert.equal(limited.truncated,true);
    assert.equal(limited.nodes.length,1);
  } finally {f.dispose();}
});
test('admitted driver stages replace existing value, re-resolve repaint, click once and return observed result',async()=>{
  const f=fixture();
  try {
    const page=f.context.page;
    await page.getByLabel('搜索关键词',{exact:true}).fill('OpenDesk',{timeout:1200});
    assert.equal(f.dom.input.value,'OpenDesk');
    assert.deepEqual(f.dom.input.events.filter(x=>x==='input'||x==='change'),['input','change']);
    assert.equal(f.dom.renders,1);
    await page.getByRole('button',{name:'搜索',exact:true}).click({timeout:1200});
    await page.getByText('搜索完成',{exact:true}).waitFor({state:'visible',timeout:1200});
    assert.equal(await page.locator('#results').textContent(),'结果：OpenDesk');
    assert.equal(f.dom.submits,1);
    assert.equal(f.commits,2);
    assert.equal(f.writes,2);
    await page.getByLabel('搜索关键词').fill('',{timeout:1200});
    assert.equal(f.dom.input.value,'');
    assert.equal(await page.getByTestId('absent').count(),0);
    await page.getByTestId('absent').waitFor({state:'hidden',timeout:60});
    await page.getByTestId('absent').waitFor({state:'detached',timeout:60});
    assert.equal(f.dom.submits,1);
  } finally {f.dispose();}
});
test('duplicate semantic match fails strictly; no click effects',async()=>{
  const f=fixture();
  try {
    const clone=new Element('button',{id:'other-button'},'搜索');f.dom.form.append(clone);
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索',exact:true}).click({timeout:200}),{
      code:'E_STRICT_MODE_VIOLATION'});
    assert.equal(f.dom.submits,0); assert.equal(f.commits,0);
  } finally {f.dispose();}
});
test('authority revoked after read-only prepare stops before single commit',async()=>{
  const f=fixture({afterPrepare:true});
  try {
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索'}).click({timeout:200}),{
      code:'E_PERMISSION'});
    assert.equal(f.dom.submits,0); assert.equal(f.commits,0);
  } finally {f.dispose();}
});
test('precise document replacement fences existing Locator',async()=>{
  const f=fixture();
  try {
    const old=f.context.page.getByRole('button',{name:'搜索'});
    f.setDocument(true);
    await assert.rejects(old.click({timeout:200}),{code:'E_DOCUMENT_REPLACED'});
    assert.equal(f.commits,0);assert.equal(f.dom.submits,0);
  } finally {f.dispose();}
});

test('native input labels, explicit roles, aria-label and aria-labelledby share semantic rules',async()=>{
  const f=fixture();
  try {
    const direct=f.dom.body.append(new Element('div',{role:'button','aria-label':'启动任务'}));
    const label=f.dom.body.append(new Element('span',{id:'submit-title'},'确认运行'));
    const labelled=f.dom.body.append(new Element('div',{role:'button','aria-labelledby':'submit-title'}));
    assert.equal(semanticRole(direct),'button');
    assert.equal(accessibleName(direct,f.dom.doc),'启动任务');
    assert.equal(accessibleName(labelled,f.dom.doc),'确认运行');
    assert.equal(await f.context.page.getByRole('button',{name:'启动任务',exact:true}).count(),1);
    assert.equal(await f.context.page.getByRole('button',{name:'确认运行',exact:true}).count(),1);
    const observation=await f.context.page.observe({maxNodes:50,maxDepth:5,maxChars:5000});
    const row=observation.nodes.find(x=>x.name==='确认运行');
    assert.ok(row?.locator,'aria-labelledby must produce a verified locator');
    assert.equal(locate(f.dom.doc,row.locator)[0],labelled);
    assert.equal(await f.context.page.getByLabel('搜索关键词',{exact:true}).getAttribute('id'),'keyword');
  }finally{f.dispose();}
});
test('disabled click never commits and does not submit during timeout',async()=>{
  const f=fixture();
  try {
    f.dom.button.disabled=true;
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索',exact:true}).click({timeout:100}),{
      code:'E_TIMEOUT'});
    assert.equal(f.commits,0);assert.equal(f.dom.submits,0);
    assert.ok(f.receipts.some(row=>row.stage==='packaged.finalFailure'));
  }finally{f.dispose();}
});
test('lost commit callback retains one page effect and an uncertainty receipt; never replays click',async()=>{
  const f=fixture({dropCommit:true,deadlineMs:120});
  try {
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索',exact:true}).click({timeout:100}),{
      code:'E_TIMEOUT'});
    assert.equal(f.commits,1);
    assert.equal(f.dom.submits,1);
    assert.ok(f.receipts.some(row=>row.stage==='locator.commitIntent'));
    assert.equal(f.receipts.some(row=>row.stage==='locator.commitNoEffect'),false);
  } finally {f.dispose();}
});
test('semantic exact text is case-sensitive; partial text normalizes spaces',()=>{
  const {doc,button}=pageDOM();
  assert.equal(locate(doc,createLocatorDescriptor('text','搜索',{exact:true})).includes(button),true);
  assert.equal(locate(doc,createLocatorDescriptor('text','搜索',{exact:false})).includes(button),true);
  assert.equal(locate(doc,createLocatorDescriptor('text','搜索x',{exact:true})).length,0);
  assert.deepEqual(validateLocatorDescriptor(createLocatorDescriptor('role','button',{name:'搜索',exact:true})),
    createLocatorDescriptor('role','button',{name:'搜索',exact:true}));
});


test('locator timeout covers stalled prepare RPC, leaves run usable and commits nothing',async()=>{
  const f=fixture({stallPrepare:true,deadlineMs:1500});
  try {
    const start=Date.now();
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索',exact:true}).click({timeout:80}),{code:'E_TIMEOUT'});
    assert.ok(Date.now()-start<800,'single operation must expire before the long run');
    assert.equal(f.commits,0); assert.equal(f.dom.submits,0);
    assert.ok(f.receipts.some(row=>row.stage==='packaged.finalFailure'));
    assert.equal(await f.context.page.getByRole('button',{name:'搜索'}).count(),1);
  }finally{f.dispose();}
});

test('observation verifies a scoped locator with duplicate names and never exposes form values',async()=>{
  const f=fixture();
  try {
    f.dom.body.append(new Element('form',{id:'other-form'})).append(new Element('button',{},'搜索'));
    f.dom.body.append(new Element('input',{id:'secret',type:'password',value:'PRIVATE_INPUT_VALUE'}));
    const observed=await f.context.page.observe({maxNodes:80,maxChars:8000});
    const found=observed.nodes.find(row=>row.role==='button'&&row.name==='搜索'&&row.locator?.parent);
    assert.equal(found?.locator.parent.value,'[id="search-form"]');
    assert.equal(locate(f.dom.doc,found.locator)[0],f.dom.button);
    assert.equal(JSON.stringify(observed).includes('PRIVATE_INPUT_VALUE'),false);
    assert.ok(observed.budget.locatorChecks<=observed.budget.maxLocatorChecks);
  }finally{f.dispose();}
});

test('observation limits traversal even when most elements have no semantic role',async()=>{
  const f=fixture();
  try {
    for(let i=0;i<4000;i++) f.dom.body.append(new Element('div'));
    const observed=await f.context.page.observe({maxNodes:200,maxDepth:5,maxChars:16000});
    assert.equal(observed.truncated,true);
    assert.ok(observed.budget.visited<=observed.budget.maxVisited);
    assert.ok(observed.budget.locatorChecks<=observed.budget.maxLocatorChecks);
    assert.ok(observed.nodes.length<=200);
  }finally{f.dispose();}
});

test('ARIA readonly, disabled, pointer-events and animation prevent a commit',async()=>{
  const f=fixture();
  try {
    f.dom.input.setAttribute('aria-readonly','true');
    await assert.rejects(f.context.page.getByLabel('搜索关键词').fill('changed',{timeout:80}),{code:'E_TIMEOUT'});
    assert.equal(f.dom.input.value,'旧内容');
    f.dom.input.removeAttribute('aria-readonly');
    f.dom.button.setAttribute('aria-disabled','true');
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索'}).click({timeout:80}),{code:'E_TIMEOUT'});
    f.dom.button.removeAttribute('aria-disabled');
    f.dom.button.setAttribute('data-pointer-events','none');
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索'}).click({timeout:80}),{code:'E_TIMEOUT'});
    f.dom.button.removeAttribute('data-pointer-events');
    f.dom.win.requestAnimationFrame=callback=>queueMicrotask(()=>{
      const el=f.dom.button; el.box={...el.box,left:el.box.left+3,right:el.box.right+3}; callback();
    });
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索'}).click({timeout:80}),{code:'E_TIMEOUT'});
    assert.equal(f.commits,0); assert.equal(f.dom.submits,0);
  }finally{f.dispose();}
});

test('subpixel movement across frame checks prevents a locator commit',async()=>{
  const f=fixture();
  try {
    f.dom.win.requestAnimationFrame=callback=>queueMicrotask(()=>{
      const el=f.dom.button;
      el.box={...el.box,left:el.box.left+0.25,right:el.box.right+0.25};
      callback();
    });
    await assert.rejects(f.context.page.getByRole('button',{name:'搜索'}).click({timeout:80}),{code:'E_TIMEOUT'});
    assert.equal(f.commits,0);
    assert.equal(f.dom.submits,0);
  }finally{f.dispose();}
});

test('completed read-only requests re-evaluate DOM; duplicate native commit has one effect',async()=>{
  const f=fixture({duplicateCommit:true});
  try {
    for(let i=0;i<25;i++)
      assert.equal(await f.context.page.getByRole('button',{name:'搜索'}).count(),1);
    await f.context.page.getByRole('button',{name:'搜索'}).click({timeout:1000});
    assert.equal(f.dom.submits,1,'native duplicate delivery must not click twice');

    const envelope={requestId:'same-read-replay',identity,revision,target,
      operation:{kind:'packaged',method:'locatorRead',args:encodeValue([
        createLocatorDescriptor('role','button',{name:'搜索',exact:true}),{action:'count'}])}};
    const read=()=>f.bus.deliver({type:'OPENDESK_CONTROLLER_PAGE_SESSION_V1',action:'execute',envelope});
    assert.equal(decodeValue((await read()).value),1);
    f.dom.form.append(new Element('button',{},'搜索'));
    assert.equal(decodeValue((await read()).value),2,
      'completed read-only request must be re-evaluated, not replayed from a stale cache');
  }finally{f.dispose();}
});


test('R13 attribute selectors, scoped indexes and strictness',async()=>{
  const f=fixture();
  try {
    const p=f.context.page;
    f.dom.input.setAttribute('placeholder','请输入搜索关键词');
    f.dom.button.setAttribute('title','启动查询');
    f.dom.body.append(new Element('img',{alt:'搜索图标'}));
    assert.equal(await p.getByPlaceholder('搜索关键词').count(),1);
    assert.equal(await p.getByTitle('启动查询',{exact:true}).count(),1);
    assert.equal(await p.getByAltText('搜索图标',{exact:true}).count(),1);
    assert.equal(await p.locator('#search-form').getByPlaceholder('请输入搜索关键词',{exact:true}).count(),1);
    const duplicate=f.dom.form.append(new Element('button',{id:'second-submit'},'搜索'));
    await assert.rejects(p.getByRole('button',{name:'搜索',exact:true}).textContent(),{code:'E_STRICT_MODE_VIOLATION'});
    assert.equal(await p.getByRole('button',{name:'搜索'}).first().getAttribute('id'),'search-submit');
    assert.equal(await p.getByRole('button',{name:'搜索'}).last().getAttribute('id'),'second-submit');
    assert.equal(await p.getByRole('button',{name:'搜索'}).nth(1).getAttribute('id'),'second-submit');
    assert.equal(await p.getByRole('button',{name:'搜索'}).nth(-2).getAttribute('id'),'search-submit');
    assert.equal(await p.getByRole('button',{name:'搜索'}).nth(-3).count(),0);
    await assert.rejects(p.getByRole('button',{name:'搜索'}).nth(10).getAttribute('id'),{code:'E_SELECTOR_NOT_FOUND'});
    assert.throws(()=>p.getByRole('button').nth(1.2),{code:'E_ARGUMENT_TYPE'});
    assert.throws(()=>p.getByRole('button').nth(10001),{code:'E_ARGUMENT_TYPE'});
    assert.throws(()=>p.getByRole('button').first().last(),{code:'E_OPTION_UNSUPPORTED'});
    assert.equal(p.modernCapabilities.version,'1.1.0-r13');
  }finally{f.dispose();}
});

test('R13 instant reads do not add page effects',async()=>{
  const f=fixture();
  try {
    const p=f.context.page, k=p.getByLabel('搜索关键词',{exact:true});
    assert.equal(await k.inputValue(),'旧内容');
    assert.equal(await k.isVisible(),true);
    assert.equal(await k.isEnabled(),true);
    assert.equal(await p.getByTestId('absent').isVisible(),false);
    assert.equal(await p.getByRole('button',{name:'搜索'}).innerText(),'搜索');
    f.dom.input.disabled=true;assert.equal(await k.isEnabled(),false);
    f.dom.input.disabled=false;f.dom.input.setAttribute('hidden','');
    assert.equal(await k.isVisible(),false);
    f.dom.input.removeAttribute('hidden');
    await assert.rejects(p.getByRole('button',{name:'搜索'}).inputValue(),{code:'E_INPUT_TARGET_UNSUPPORTED'});
    await assert.rejects(p.getByRole('button',{name:'搜索'}).isChecked(),{code:'E_INPUT_TARGET_UNSUPPORTED'});
    await assert.rejects(p.getByTestId('absent').isEnabled(),{code:'E_SELECTOR_NOT_FOUND'});
    assert.equal(f.commits,0);assert.equal(f.writes,0);assert.equal(f.dom.submits,0);
  }finally{f.dispose();}
});

test('R13 checkbox and selectOption actions share single-commit stage',async()=>{
  const f=fixture();
  try {
    const p=f.context.page;
    const box=f.dom.form.append(new Element('input',{id:'agree',type:'checkbox'}));
    box.box={left:250,top:10,right:270,bottom:30,width:20,height:20};
    const select=f.dom.form.append(new Element('select',{id:'region',value:'a'}));
    select.box={left:300,top:10,right:430,bottom:40,width:130,height:30};
    select.append(new Element('option',{value:'a'},'A'));
    select.append(new Element('option',{value:'b'},'B'));
    const checked=p.locator('#agree');
    assert.equal(await checked.isChecked(),false);
    await checked.check({timeout:400});
    assert.equal(await checked.isChecked(),true);
    await checked.check({timeout:400});
    assert.equal(box.clicks,1,'already checked must not toggle');
    await checked.uncheck({timeout:400});
    assert.equal(box.clicks,2);assert.equal(await checked.isChecked(),false);
    await p.locator('#region').selectOption('b',{timeout:400});
    assert.equal(await p.locator('#region').inputValue(),'b');
    assert.deepEqual(select.events.filter(x=>x==='input'||x==='change'),['input','change']);
    await p.locator('#region').selectOption('b',{timeout:400});
    assert.equal(select.events.length,2,'same value must not dispatch');
    assert.equal(f.writes,5);
    await assert.rejects(checked.selectOption('b',{timeout:100}),{code:'E_INPUT_TARGET_UNSUPPORTED'});
    const radio=f.dom.form.append(new Element('input',{id:'radio',type:'radio'}));
    radio.box={left:450,top:10,right:470,bottom:30,width:20,height:20};
    await assert.rejects(p.locator('#radio').uncheck({timeout:100}),{code:'E_INPUT_TARGET_UNSUPPORTED'});
    assert.equal(radio.clicks,undefined);
  }finally{f.dispose();}
});

test('R13 lost checkbox commit callback never toggles twice',async()=>{
  const f=fixture({dropCommit:true,deadlineMs:150});
  try {
    const box=f.dom.form.append(new Element('input',{id:'agree',type:'checkbox'}));
    box.box={left:250,top:10,right:270,bottom:30,width:20,height:20};
    await assert.rejects(f.context.page.locator('#agree').check({timeout:110}),{code:'E_TIMEOUT'});
    assert.equal(box.checked,true);assert.equal(box.clicks,1);assert.equal(f.commits,1);
    assert.ok(f.receipts.some(row=>row.stage==='locator.commitIntent'));
    assert.equal(f.receipts.some(row=>row.stage==='locator.commitNoEffect'),false);
  }finally{f.dispose();}
});

test('R13 indexed locator cannot cross document replacement',async()=>{
  const f=fixture();
  try {
    const selected=f.context.page.getByRole('button',{name:'搜索'}).first();
    f.setDocument(true);
    await assert.rejects(selected.isVisible(),{code:'E_DOCUMENT_REPLACED'});
    await assert.rejects(selected.click({timeout:80}),{code:'E_DOCUMENT_REPLACED'});
    assert.equal(f.commits,0);assert.equal(f.dom.submits,0);
  }finally{f.dispose();}
});
