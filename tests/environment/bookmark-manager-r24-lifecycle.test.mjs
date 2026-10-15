import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';

// DOM/SDK fixtures exercise the actual sandbox entrypoint, not Chrome or trusted
// clicks. Native installation/permission results must be recorded separately.
class Element {
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.dataset={};this.style={};
    this.attributes={};this.listeners={};this.value='';this.hidden=false;
  }
  set textContent(value){this.text=String(value);this.children=[]}
  get textContent(){return this.text||this.children.map(child=>child.textContent).join('')}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.text='';this.children=children}
  setAttribute(name,value){this.attributes[name]=value}
  getAttribute(name){return this.attributes[name]}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
  fire(name,event={}){for(const fn of this.listeners[name]||[])fn({preventDefault(){},...event})}
  focus(){}
  all(){return this.children.flatMap(child=>[child,...child.all()])}
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))};
async function ui(){
  const ids=new Map(),timers=new Map(),calls=[],writes=[],order=[];
  let timerId=0,version=0,observer=null,onLoad=null,reads=0,now=Date.now();
  const sessions=new Map(),lifecycle=new Map();
  class Clock extends Date {static now(){return now}}
  const root=new Element();
  const q=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id)};
  root.querySelector=selector=>q(selector.slice(1));
  root.querySelectorAll=()=>[...ids.values()].flatMap(el=>el.all()).filter(el=>el.tagName==='button');
  const context=createContext({URL,Date:Clock,document:{createElement:tag=>new Element(tag),
    createDocumentFragment:()=>new Element()},OpenDeskTool:{root},
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>lifecycle.set(name,fn)});
  runInContext(await readFile('examples/sidebar-tools/bookmark-manager/src/model.js','utf8'),context);
  const tree=()=>context.BookmarkR2Model.bookmarkTree([{id:'0',title:'root',children:[
    {id:'1',parentId:'0',title:'bar',children:[{id:'10',parentId:'1',index:0,
      title:version?'external title':'reviewed title',url:'https://example.org/'}]}
  ]}]);
  const service={
    probe:async()=>({ready:true}),
    load:async()=>{order.push('load');reads++;const snapshot=tree();onLoad?.();return snapshot},
    watchStart:async()=>{order.push('start');observer={sessionRef:'session-'+order.length,
      cursor:'0',expiresAt:now+30000};
      sessions.set(observer.sessionRef,{...observer,pending:[]});return observer},
    watchRead:async row=>{
      order.push('read:'+row.sessionRef);
      const active=sessions.get(row.sessionRef);
      if(!active||active.expiresAt<=now)throw Object.assign(Error('expired'),{code:'E_SESSION_EXPIRED'});
      const events=active.pending.splice(0,50);
      return {events,nextCursor:String(Number(row.cursor)+events.length),expiresAt:active.expiresAt};
    },
    watchStop:async row=>{
      order.push('stop:'+row.sessionRef);calls.push(['stop',row.sessionRef]);
      sessions.delete(row.sessionRef);if(row.sessionRef===observer?.sessionRef)observer=null;
    },
    update:async args=>{writes.push(args)}
  };
  context.BookmarkR2Service={create:()=>service};
  runInContext(await readFile('examples/sidebar-tools/bookmark-manager/src/main.js','utf8'),context);
  await settle();
  return {q,root,service,calls,writes,order,timers,
    get reads(){return reads},get observer(){return observer},
    get activeObservers(){return sessions.size},
    set onLoad(fn){onLoad=fn},
    change(){version++;for(const row of sessions.values())row.pending.push({kind:'changed',id:'10'})},
    advance(ms){now+=ms},close(){lifecycle.get('pagehide')?.()},
    async tick(){const entry=timers.entries().next().value;assert(entry,'poll must be scheduled');
      timers.delete(entry[0]);entry[1]();await settle()},
    async refresh(){q('bm-refresh').fire('click');await settle()},
    async edit(){
      const menu=root.querySelectorAll().find(el=>el.getAttribute('aria-label')==='管理 reviewed title');
      assert(menu);menu.fire('click');
      const edit=root.querySelectorAll().find(el=>el.textContent==='编辑');assert(edit);edit.fire('click');
      q('bm-name').value='my unsaved draft';await settle();
    }
  };
}

test('R2.4 subscribe before snapshot so a concurrent change triggers a subsequent full resync',async()=>{
  const app=await ui();
  assert.deepEqual(app.order.slice(0,2),['start','load']);
  let changed=false;
  app.onLoad=()=>{if(!changed){changed=true;app.change()}};
  await app.refresh();
  const before=app.reads;
  await app.tick();
  assert.equal(app.reads,before+1,'event arriving during snapshot read is retained');
});

test('R2.4 an event refresh preserves draft and original reviewed write precondition',async()=>{
  const app=await ui();await app.edit();app.change();await app.refresh();
  assert.equal(app.q('bm-name').value,'my unsaved draft');
  app.q('bm-form').fire('submit');await settle();
  assert.equal(app.writes.length,1);
  assert.equal(app.writes[0].title,'my unsaved draft');
  assert.equal(app.writes[0].expected.title,'reviewed title',
    'automatic resync must never silently approve an externally changed node');
});

test('R2.4 failed snapshot closes its preceding observer and hides the stale tree',async()=>{
  const app=await ui();
  app.service.load=async()=>{throw Object.assign(Error('revoked'),{code:'E_GRANT_REVOKED'})};
  await app.refresh();
  assert.equal(app.observer,null);
  assert.equal(app.timers.size,0);
  assert.equal(app.q('bm-workspace').hidden,true);
  assert.equal(app.q('bm-gate').hidden,false);
});

test('R2.5 quiet session rotation starts new, drains/stops old, reads new without a tree load',async()=>{
  const app=await ui();await app.edit();
  const old=app.observer,loads=app.reads,from=app.order.length;
  app.advance(27000);await app.tick();
  const next=app.observer;
  assert.notEqual(next.sessionRef,old.sessionRef);
  assert.deepEqual(app.order.slice(from),['read:'+old.sessionRef,'start',
    'read:'+old.sessionRef,'stop:'+old.sessionRef,'read:'+next.sessionRef]);
  assert.equal(app.reads,loads);assert.equal(app.activeObservers,1);
  assert.equal(app.q('bm-name').value,'my unsaved draft');
  await app.tick();assert.equal(app.reads,loads);
  app.close();await settle();assert.equal(app.activeObservers,0);
});

test('R2.5 rotation retains old-only and new-only changes and resyncs the tree',async()=>{
  for(const stage of ['before-start','after-stop']){
    const app=await ui(),old=app.observer,loads=app.reads;
    if(stage==='before-start'){
      const start=app.service.watchStart;let changed=false;
      app.service.watchStart=async()=>{
        if(!changed){changed=true;app.change()}
        return start();
      };
    }else{
      const stop=app.service.watchStop;
      app.service.watchStop=async row=>{
        await stop(row);if(row.sessionRef===old.sessionRef)app.change();
      };
    }
    app.advance(27000);await app.tick();
    assert.equal(app.reads,loads+1,stage+' change must invalidate the snapshot');
    assert.match(app.q('bm-list').textContent,/external title/);
    app.close();await settle();assert.equal(app.activeObservers,0);
  }
});

test('R2.5 rotation drains both 50-event pages of the bounded old session',async()=>{
  const app=await ui(),old=app.observer,loads=app.reads;
  const start=app.service.watchStart;let changed=false;
  app.service.watchStart=async()=>{
    if(!changed){changed=true;for(let i=0;i<100;i++)app.change()}
    return start();
  };
  app.advance(27000);await app.tick();
  assert.equal(app.order.filter(op=>op==='read:'+old.sessionRef).length,3,
    'one initial read followed by two drain pages');
  assert.equal(app.reads,loads+1);
  app.close();await settle();
});

test('R2.5 revocation while draining rotation closes both sessions and clears private UI',async()=>{
  const app=await ui(),read=app.service.watchRead;let reads=0;
  app.service.watchRead=async row=>{
    if(++reads===2)throw Object.assign(Error('revoked'),{code:'E_GRANT_REVOKED'});
    return read(row);
  };
  app.advance(27000);await app.tick();
  assert.equal(app.activeObservers,0);assert.equal(app.timers.size,0);
  assert.equal(app.q('bm-workspace').hidden,true);
  assert.equal(app.q('bm-list').textContent,'');
});

test('R2.5 pagehide during old-session drain closes both sessions without late resync',async()=>{
  const app=await ui(),read=app.service.watchRead,loads=app.reads;let reads=0,finish;
  const pending=new Promise(resolve=>{finish=resolve});
  app.service.watchRead=async row=>{
    if(++reads===2)await pending;return read(row);
  };
  app.advance(27000);await app.tick();
  assert.equal(app.activeObservers,2);
  app.close();finish();await settle();
  assert.equal(app.activeObservers,0);assert.equal(app.timers.size,0);
  assert.equal(app.reads,loads);
});

test('R2.5 expired sessions and event gaps still recover with a fresh snapshot',async()=>{
  for(const code of ['E_SESSION_EXPIRED','E_BOOKMARK_EVENT_GAP']){
    const app=await ui(),read=app.service.watchRead,loads=app.reads;let failed=false;
    app.service.watchRead=async row=>{
      if(!failed){failed=true;throw Object.assign(Error(code),{code})}
      return read(row);
    };
    await app.tick();assert.equal(app.activeObservers,0);
    await app.tick();assert.equal(app.reads,loads+1,code);
    app.close();await settle();assert.equal(app.activeObservers,0);
  }
});
