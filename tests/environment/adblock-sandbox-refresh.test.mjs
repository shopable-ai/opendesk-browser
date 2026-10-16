import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function sandbox(){
  const handlers={},nodes=new Map(),pending=new Map(),requests=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.dataset={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,handler){this.listeners[name]=handler;}
  }
  for(const id of ['exceptions','exception-count','adblock-message'])nodes.set(id,new Element('div'));
  const root={querySelector:selector=>selector.startsWith('#')?nodes.get(selector.slice(1)):null};
  let status={exceptions:['127.0.0.1'],toolEnabled:true,rules:{verified:true}},failure=false;
  const request=async (operation,input)=>{
    requests.push({operation,input});
    const deferred=pending.get(operation)?.shift();
    if(deferred)return deferred.promise;
    assert.equal(operation,'adblock.status');
    if(failure)throw Error('native status unavailable');
    return structuredClone(status);
  };
  const context=vm.createContext({globalThis:{OpenDeskTool:{root,request}},
    document:{hidden:false,createElement:tag=>new Element(tag),addEventListener(){}},
    window:{addEventListener:(name,handler)=>{handlers[name]=handler;}},
    queueMicrotask,setInterval:handler=>{handlers.poll=handler;}});
  vm.runInContext(await readFile(new URL('../../examples/sidebar-tools/adblock/src/main.js',import.meta.url),'utf8'),context);
  const settled=()=>new Promise(resolve=>setImmediate(resolve));
  await settled();
  const restore=()=>nodes.get('exceptions').children[0]?.children.find(node=>node.tag==='button');
  const defer=operation=>{
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    if(!pending.has(operation))pending.set(operation,[]);
    pending.get(operation).push({promise});
    return {resolve,reject};
  };
  return {handlers,settled,restore,nodes,defer,requests,
    setStatus:value=>{status=value;},fail:()=>{failure=true;}};
}

test('iframe focus before button focus and unchanged polling preserve the real restore target',async()=>{
  const f=await sandbox(),button=f.restore();assert.ok(button);
  // Chrome window focus arrives before the button's own focus/mouseup/click.
  f.handlers.focus();await f.settled();
  assert.equal(f.restore(),button,'focus refresh must not detach the pending native click target');
  f.handlers.poll();await f.settled();
  assert.equal(f.restore(),button,'unchanged background read must preserve keyboard focus too');
});

test('changed authority status and failed read still remove stale restore controls',async()=>{
  const f=await sandbox();
  f.setStatus({exceptions:[],toolEnabled:true,rules:{verified:true}});
  f.handlers.poll();await f.settled();assert.equal(f.restore(),undefined);
  f.setStatus({exceptions:['127.0.0.1'],toolEnabled:false,rules:{verified:true}});
  f.handlers.poll();await f.settled();assert.equal(f.restore().disabled,true);
  f.fail();f.handlers.poll();await f.settled();
  assert.equal(f.restore(),undefined);
  assert.equal(f.nodes.get('adblock-message').dataset.error,'true');
});

for(const outcome of ['success','invalid success','failure']){
  test(`pending status ${outcome} cannot replace a busy restore or its confirmation message`,async()=>{
    const f=await sandbox(),oldStatus=f.defer('adblock.status');
    f.handlers.poll();await f.settled();
    const restoreRequest=f.defer('adblock.site.restore');
    const restoring=f.restore().listeners.click();
    await f.settled();
    const busyButton=f.restore(),message=f.nodes.get('adblock-message');
    const waiting=message.textContent;
    assert.equal(busyButton.disabled,true);
    assert.match(waiting,/可信宿主确认/);
    const readCount=f.requests.filter(item=>item.operation==='adblock.status').length;

    if(outcome==='failure')oldStatus.reject(Error('old native status unavailable'));
    else oldStatus.resolve({exceptions:outcome==='success'?['stale.example']:null,toolEnabled:true});
    await f.settled();

    assert.equal(f.restore(),busyButton,'old status must not replace the busy list');
    assert.equal(f.restore().disabled,true);
    assert.equal(message.textContent,waiting,'old status must not overwrite the pending confirmation');
    assert.equal(message.dataset.error,'false');
    assert.equal(f.requests.filter(item=>item.operation==='adblock.status').length,readCount,
      'authority refresh must wait until restore finishes');

    const authoritative=f.defer('adblock.status');
    restoreRequest.reject(Error('已取消恢复'));
    await restoring;await f.settled();
    assert.equal(f.requests.filter(item=>item.operation==='adblock.status').length,readCount+1,
      'discarding an old status must schedule a fresh authority read');
    authoritative.reject(Error('current native status unavailable'));
    await f.settled();
    assert.equal(f.restore(),undefined,'a fresh failure must remove stale restore controls');
    assert.equal(message.dataset.error,'true');
    assert.match(message.textContent,/current native status unavailable/);
  });
}

for(const outcome of ['success','failure']){
  test(`status ${outcome} begun before restore cannot overwrite its completed authoritative result`,async()=>{
    const f=await sandbox(),oldStatus=f.defer('adblock.status');
    f.handlers.poll();await f.settled();
    const restoreRequest=f.defer('adblock.site.restore');
    const restoring=f.restore().listeners.click();
    const checked=f.defer('adblock.status');
    restoreRequest.resolve({exceptions:[],rules:{verified:true}});
    await f.settled();
    checked.resolve({exceptions:[],toolEnabled:true,rules:{verified:true}});
    await restoring;await f.settled();
    assert.equal(f.restore(),undefined);
    assert.match(f.nodes.get('adblock-message').textContent,/已恢复/);

    const authoritative=f.defer('adblock.status');
    if(outcome==='failure')oldStatus.reject(Error('obsolete read failed'));
    else oldStatus.resolve({exceptions:['stale.example'],toolEnabled:true});
    await f.settled();
    assert.equal(f.restore(),undefined,'an obsolete read must not restore an old exception');
    assert.match(f.nodes.get('adblock-message').textContent,/已恢复/);

    authoritative.resolve({exceptions:['current.example'],toolEnabled:true,rules:{verified:true}});
    await f.settled();
    assert.equal(f.restore()['aria-label'],'恢复 current.example 的广告过滤',
      'a fresh authority read must still be applied');
  });
}
