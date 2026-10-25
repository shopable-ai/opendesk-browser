import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateProgramProject} from '../../../../scripts/validate-program-project.mjs';
import {createXmindFrameRenderer,requireXmindFrameFactory} from '../src/xmind-frame.js';
import {serveXmindFrame} from '../src/xmind-frame-child.js';
import {frameEnvelope} from '../src/xmind-frame-protocol.js';

const window={crypto:{randomUUID}};
const tree={id:'root',title:'Original HTML visible text',children:[]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};};

function harness({instanceId='answer-A',revision=0,rendererFactory,timeoutMs=250}={}){
  const calls=[],resources=[];
  const renderers=[];
  let folded=false;
  const factory=rendererFactory||((input)=>{
    calls.push(['init',input]);
    const renderer={ready:Promise.resolve(),nodeCount:3,
      async fit(value){calls.push(['fit',value]);},
      async reflow(){calls.push(['reflow']);},
      async setTheme(value){calls.push(['setTheme',value]);},
      async zoomBy(value){calls.push(['zoomBy',value]);},
      async toggleAll(){calls.push(['toggleAll']);return folded=!folded;},
      async destroy(){calls.push(['destroy']);}};
    renderers.push(renderer);return renderer;
  });
  const canvas={onlyParent:true};
  const api=createXmindFrameRenderer({window,canvas,tree,identity:{instanceId,revision},timeoutMs,
    frameFactory:async input=>{
      assert.equal(input.canvas,canvas);
      const {port1,port2}=new MessageChannel();
      const childCanvas={onlyChild:true};
      const child=serveXmindFrame({port:port2,identity:input.identity,window,canvas:childCanvas,
        rendererFactory:factory});
      const resource={...input,port:port1,childPort:port2,childCanvas,removed:0,
        async destroy(){this.removed++;await child.destroy();}};
      resources.push(resource);return resource;
    }});
  return {api,calls,resources,renderers};
}

function manualPeer({timeoutMs=1000}={}){
  const requests=[],waiters=[];
  let binding,peer,receive,removed=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree,timeoutMs,
    identity:{instanceId:'answer-A',revision:4},
    frameFactory:async({identity})=>{
      binding=identity;
      const {port1,port2}=new MessageChannel();peer=port2;
      const add=port1.addEventListener.bind(port1);
      port1.addEventListener=(type,listener,...rest)=>{
        if(type==='message')receive=listener;
        return add(type,listener,...rest);
      };
      peer.addEventListener('message',event=>{
        const request=event.data;
        if(request.command==='init'||request.command==='destroy'){
          peer.postMessage({...request,kind:'reply',ok:true,nodeCount:8});
        }else{requests.push(request);waiters.shift()?.(request);}
      });peer.start();
      return {port:port1,destroy(){removed++;peer.close();}};
    }});
  return {api,requests,next:()=>new Promise(resolve=>waiters.push(resolve)),
    send(data){peer.postMessage(data);},get binding(){return binding;},
    foreign(data){receive({currentTarget:{},data});},
    get removed(){return removed;}};
}

test('production loader is absent: parent SDK globals cannot grant frame access',()=>{
  assert.throws(()=>requireXmindFrameFactory(),{code:'E_XMIND_RUNTIME_UNAVAILABLE'});
  assert.throws(()=>createXmindFrameRenderer({window:{_SB_:{createWorkbookEditor(){}}}}),
    {code:'E_XMIND_RUNTIME_UNAVAILABLE'});
});

test('production entry satisfies the real builder validator and remains non-installable',async()=>{
  const project=await validateProgramProject(fileURLToPath(new URL('../',import.meta.url)));
  assert.equal(project.id,'opendesk.ai-reply-mindmap');
  assert.equal(project.entry,'src/main.js');
  assert.equal(project.status,'AUTHORING_VALID_NOT_PACKAGED');
  assert.equal(project.installable,false);
});

test('private channel delegates lifecycle to child renderer and preserves exact input',async()=>{
  const h=harness();await h.api.ready;
  assert.equal(h.calls[0][0],'init');
  assert.deepEqual(h.calls[0][1].tree,tree);
  assert.equal(h.calls[0][1].canvas,h.resources[0].childCanvas);
  assert.equal(h.api.nodeCount,3);
  await h.api.fit({resetManual:false});await h.api.reflow();await h.api.setTheme('dark');
  await h.api.zoomBy(1.25);
  assert.equal(await h.api.toggleAll(),true);assert.equal(await h.api.toggleAll(),false);
  assert.deepEqual(h.calls.slice(1).map(row=>row[0]),
    ['fit','reflow','setTheme','zoomBy','toggleAll','toggleAll']);
  const first=h.api.destroy();assert.equal(h.api.destroy(),first);await first;
  assert.equal(h.resources[0].removed,1);assert.equal(h.resources[0].signal.aborted,true);
  assert.equal(h.calls.filter(row=>row[0]==='destroy').length,1);
  await assert.rejects(h.api.fit(),{code:'E_XMIND_FRAME_DESTROYED'});
});

test('wrong session/instance/revision, unknown ID, wrong command and malformed replies never settle',async()=>{
  const h=manualPeer();await h.api.ready;
  const next=h.next();let settled=false;
  const operation=h.api.fit().then(()=>{settled=true;});const request=await next;
  const good={...request,kind:'reply',ok:true,nodeCount:5};
  h.foreign(good);
  for(const mutation of [{sessionId:'foreign'},{instanceId:'answer-B'},{revision:3},
    {id:request.id+99},{command:'zoomBy'},{kind:'request'},{ok:'true'},
    {nodeCount:-1},{protocol:'foreign'}])h.send({...good,...mutation});
  await delay(20);assert.equal(settled,false);
  h.send(good);await operation;assert.equal(h.api.nodeCount,5);
  // A consumed reply cannot complete a subsequent request, or change state.
  const another=h.next();let nextSettled=false;
  const pending=h.api.reflow().then(()=>{nextSettled=true;});const request2=await another;
  h.send({...good,nodeCount:99});await delay(20);
  assert.equal(nextSettled,false);assert.equal(h.api.nodeCount,5);
  h.send({...request2,kind:'reply',ok:true,nodeCount:7});await pending;
  await h.api.destroy();assert.equal(h.removed,1);
});

test('command timeout removes its pending slot; late reply cannot mutate counts',async()=>{
  const h=manualPeer({timeoutMs:45});await h.api.ready;
  const next=h.next();const operation=h.api.fit();const request=await next;
  await assert.rejects(operation,{code:'E_XMIND_FRAME_TIMEOUT',mindmapStage:'frame.fit'});
  h.send({...request,kind:'reply',ok:true,nodeCount:500});await delay(10);
  assert.equal(h.api.nodeCount,8);await h.api.destroy();
});

test('Stop immediately rejects pending commands, closes channel and removes frame once',async()=>{
  const h=manualPeer();await h.api.ready;
  const next=h.next();const pending=h.api.zoomBy(2);await next;
  const rejected=assert.rejects(pending,{code:'E_XMIND_FRAME_DESTROYED'});
  await h.api.destroy();await rejected;assert.equal(h.removed,1);
});

test('timeout waiting for destroy acknowledgement still removes test frame',async()=>{
  let peer,removed=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree,timeoutMs:30,
    identity:{instanceId:'A',revision:0},frameFactory:({identity})=>{
      const {port1,port2}=new MessageChannel();peer=port2;
      peer.on('message',data=>{if(data.command==='init')peer.postMessage(
        frameEnvelope(identity,{kind:'reply',id:data.id,command:'init',ok:true,nodeCount:1}));});
      return {port:port1,destroy(){removed++;peer.close();}};
    }});
  await api.ready;await assert.rejects(api.destroy(),{code:'E_XMIND_FRAME_TIMEOUT',mindmapStage:'frame.destroy'});
  assert.equal(removed,1);
});

test('Stop before loader resolution cleans up the late frame without initialization',async()=>{
  const gate=deferred();let removed=0,signal;
  const api=createXmindFrameRenderer({window,canvas:{},tree,identity:{instanceId:'A',revision:0},
    frameFactory:input=>{signal=input.signal;return gate.promise;}});
  await tick();await api.destroy();
  await assert.rejects(api.ready,{code:'E_XMIND_FRAME_DESTROYED'});
  assert.equal(signal.aborted,true);
  const {port1,port2}=new MessageChannel();let initialized=false;
  port2.on('message',()=>{initialized=true;});
  gate.resolve({port:port1,destroy(){removed++;port2.close();}});
  await tick();await tick();assert.equal(removed,1);assert.equal(initialized,false);
});

test('immediate Stop does not invoke a frame loader at all',async()=>{
  let calls=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree,identity:{instanceId:'A',revision:0},
    frameFactory(){calls++;throw new Error('must not load');}});
  await api.destroy();await assert.rejects(api.ready,{code:'E_XMIND_FRAME_DESTROYED'});
  assert.equal(calls,0);
});

test('loader timeout retires a late resource and cannot enable commands',async()=>{
  const gate=deferred();let removed=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree,timeoutMs:25,
    identity:{instanceId:'A',revision:0},frameFactory:()=>gate.promise});
  await assert.rejects(api.ready,{code:'E_XMIND_FRAME_TIMEOUT',mindmapStage:'frame.create'});
  const {port1,port2}=new MessageChannel();
  gate.resolve({port:port1,destroy(){removed++;port2.close();}});
  await tick();await tick();assert.equal(removed,1);
  await assert.rejects(api.reflow(),{code:'E_XMIND_FRAME_DESTROYED'});await api.destroy();
});

test('Stop during child initialization retires the late renderer',async()=>{
  const init=deferred();let closed=0;
  const h=harness({rendererFactory:()=>({ready:init.promise,nodeCount:0,
    async destroy(){await init.promise;closed++;}})});
  // Wait until the child has received init, while its renderer is still pending.
  await delay(15);
  const readyRejected=assert.rejects(h.api.ready,{code:'E_XMIND_FRAME_DESTROYED'});
  const closing=h.api.destroy();init.resolve();await closing;await readyRejected;
  assert.equal(closed,1);assert.equal(h.resources[0].removed,1);
});

test('A/B/C remain independent under parallel theme, fold, refresh session and Stop',async()=>{
  const [a,b,c]=['answer-A','answer-B','answer-C'].map(instanceId=>harness({instanceId}));
  await Promise.all([a.api.ready,b.api.ready,c.api.ready]);
  const sessions=[a,b,c].map(h=>h.resources[0].identity.sessionId);
  assert.equal(new Set(sessions).size,3);
  await a.api.zoomBy(.8);await b.api.setTheme('dark');assert.equal(await c.api.toggleAll(),true);
  await a.api.destroy();assert.equal(await b.api.toggleAll(),true);
  const replacement=harness({instanceId:'answer-A',revision:1});await replacement.api.ready;
  assert.notEqual(replacement.resources[0].identity.sessionId,sessions[0]);
  assert.equal(replacement.resources[0].identity.revision,1);
  assert.equal(a.calls.some(row=>row[0]==='setTheme'),false);
  assert.equal(b.calls.some(row=>row[0]==='zoomBy'),false);
  assert.equal(c.calls.some(row=>row[0]==='setTheme'),false);
  await Promise.all([b.api.destroy(),c.api.destroy(),replacement.api.destroy()]);
});

test('child rejects foreign requests, duplicate IDs, unknown commands and invalid arguments',async()=>{
  const {port1,port2}=new MessageChannel();
  const identity={sessionId:'private-session',instanceId:'answer-A',revision:6};
  const calls=[],replies=[];
  const child=serveXmindFrame({port:port2,identity,window,canvas:{},rendererFactory:()=>({
    ready:Promise.resolve(),nodeCount:1,async zoomBy(value){calls.push(value);},async destroy(){}})});
  port1.on('message',data=>replies.push(data));
  const send=(id,command,args,extra={})=>port1.postMessage(frameEnvelope(identity,
    {kind:'request',id,command,args,...extra}));
  send(1,'init',{tree,skinMode:'light'});await delay(10);
  send(2,'zoomBy',2,{instanceId:'answer-B'});send(2,'zoomBy',2,{sessionId:'other'});
  send(2,'zoomBy',2,{revision:5});send(2,'eval','arbitrary');await delay(10);
  assert.equal(replies.length,1);assert.deepEqual(calls,[]);
  send(2,'zoomBy',2);send(2,'zoomBy',3);send(1,'zoomBy',4);await delay(10);
  assert.deepEqual(calls,[2]);assert.equal(replies.length,2);
  send(3,'zoomBy',Infinity);send(4,'setTheme','url(evil)');await delay(10);
  assert.deepEqual(replies.slice(2).map(row=>row.error.code),['E_XMIND_ZOOM','E_XMIND_THEME']);
  await child.destroy();port1.close();
});

test('renderer failure is returned on the bound request and cleanup failure remains visible',async()=>{
  let closed=0;
  const h=harness({rendererFactory:()=>({ready:Promise.resolve(),nodeCount:1,
    async fit(){throw Object.assign(new Error('failed'),{code:'E_REAL_RENDER'});},
    async destroy(){closed++;throw Object.assign(new Error('close failed'),{code:'E_REAL_CLOSE'});}})});
  await h.api.ready;await assert.rejects(h.api.fit(),{code:'E_REAL_RENDER'});
  await assert.rejects(h.api.destroy(),{code:'E_REAL_CLOSE'});
  assert.equal(closed,1);assert.equal(h.resources[0].removed,1);
});

test('a future reply is discarded rather than saved for the next command',async()=>{
  const h=manualPeer();await h.api.ready;
  const next=h.next();const first=h.api.fit();const request=await next;
  h.send({...request,id:request.id+1,command:'toggleAll',kind:'reply',ok:true,value:true,nodeCount:50});
  h.send({...request,kind:'reply',ok:true,nodeCount:3});await first;
  const another=h.next();let settled=false;
  const second=h.api.toggleAll().then(value=>{settled=true;return value;});
  const request2=await another;
  assert.equal(request2.id,request.id+1);
  await delay(10);assert.equal(settled,false);assert.equal(h.api.nodeCount,3);
  // Even the right identity and ID cannot authorize an invalid result shape.
  h.send({...request2,kind:'reply',ok:true,value:'true',nodeCount:3});
  h.send({...request2,kind:'reply',ok:false,error:{code:42}});
  await delay(10);assert.equal(settled,false);
  h.send({...request2,kind:'reply',ok:true,value:false,nodeCount:3});
  assert.equal(await second,false);await h.api.destroy();
});

test('synchronous loader failure rejects ready and every command waiting for it',async()=>{
  const failure=Object.assign(new Error('loader failed'),{code:'E_TEST_LOADER'});
  const api=createXmindFrameRenderer({window,canvas:{},tree,identity:{instanceId:'A',revision:0},
    frameFactory(){throw failure;}});
  const fit=api.fit(),theme=api.setTheme('dark');
  await Promise.all([api.ready,fit,theme].map(value=>assert.rejects(value,error=>error===failure)));
  await api.destroy();
});

test('invalid endpoint startup still calls synchronous frame cleanup exactly once',async()=>{
  let removed=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree,identity:{instanceId:'A',revision:0},
    frameFactory:()=>({port:{},destroy(){removed++;}})});
  await assert.rejects(api.ready,{code:'E_XMIND_FRAME_PORT',mindmapStage:'frame.connect'});
  await api.destroy();assert.equal(removed,1);
});

test('synchronous postMessage clone failure removes frame instead of leaving init pending',async()=>{
  let removed=0;
  const api=createXmindFrameRenderer({window,canvas:{},tree:{...tree,uncloneable(){}},
    identity:{instanceId:'A',revision:0},frameFactory:()=>{
      const {port1,port2}=new MessageChannel();
      return {port:port1,destroy(){removed++;port2.close();}};
    }});
  await assert.rejects(api.ready,{name:'DataCloneError'});
  await api.destroy();assert.equal(removed,1);
});

test('synchronous child initialization failure rejects ready and retires its frame',async()=>{
  let starts=0;
  const h=harness({rendererFactory(){starts++;
    throw Object.assign(new Error('runtime unavailable'),{code:'E_REAL_INIT'});}});
  await assert.rejects(h.api.ready,{code:'E_REAL_INIT'});
  await h.api.destroy();assert.equal(starts,1);assert.equal(h.resources[0].removed,1);
});

test('synchronous child close failure rejects destroy after removing its frame',async()=>{
  let closed=0;
  const h=harness({rendererFactory:()=>({ready:Promise.resolve(),nodeCount:1,
    destroy(){closed++;throw Object.assign(new Error('sync close failed'),{code:'E_SYNC_CLOSE'});}})});
  await h.api.ready;
  const closing=h.api.destroy();assert.equal(h.api.destroy(),closing);
  await assert.rejects(closing,{code:'E_SYNC_CLOSE'});
  assert.equal(closed,1);assert.equal(h.resources[0].removed,1);
});

test('synchronous parent frame cleanup failure stays observable after pending commands reject',async()=>{
  let removed=0,peer;
  const failure=Object.assign(new Error('sync frame cleanup'),{code:'E_FRAME_CLOSE'});
  const api=createXmindFrameRenderer({window,canvas:{},tree,identity:{instanceId:'A',revision:0},
    frameFactory:()=>{
      const {port1,port2}=new MessageChannel();peer=port2;
      peer.on('message',request=>{
        if(request.command==='init'||request.command==='destroy')
          peer.postMessage({...request,kind:'reply',ok:true,nodeCount:1});
      });
      return {port:port1,destroy(){removed++;peer.close();throw failure;}};
    }});
  await api.ready;
  const pending=api.fit();await tick();
  const rejected=assert.rejects(pending,{code:'E_XMIND_FRAME_DESTROYED'});
  await assert.rejects(api.destroy(),error=>error===failure);await rejected;
  assert.equal(removed,1);
});

test('late loader cleanup rejection is reported even after Stop has completed',async()=>{
  const gate=deferred(),reported=[];
  const failure=Object.assign(new Error('late close failed'),{code:'E_LATE_CLOSE'});
  const api=createXmindFrameRenderer({window:{...window,reportError:error=>reported.push(error)},
    canvas:{},tree,identity:{instanceId:'A',revision:0},frameFactory:()=>gate.promise});
  await tick();await api.destroy();
  await assert.rejects(api.ready,{code:'E_XMIND_FRAME_DESTROYED'});
  const {port1,port2}=new MessageChannel();
  gate.resolve({port:port1,destroy(){port2.close();throw failure;}});
  await tick();await tick();assert.equal(reported.length,1);
  assert.equal(reported[0].message,failure.message);assert.equal(reported[0].code,failure.code);
  assert.equal(reported[0].mindmapStage,'frame.destroy');
});

test('child messageerror observes cleanup rejection and retains it for explicit destroy',async()=>{
  const {port1,port2}=new MessageChannel();
  const identity={sessionId:'private',instanceId:'A',revision:0};
  const failure=Object.assign(new Error('channel close failed'),{code:'E_CHANNEL_CLOSE'});
  const child=serveXmindFrame({port:port2,identity,window,canvas:{},rendererFactory:()=>({
    ready:Promise.resolve(),nodeCount:1,destroy(){throw failure;}})});
  const initialized=new Promise(resolve=>port1.once('message',resolve));
  port1.postMessage(frameEnvelope(identity,{kind:'request',id:1,command:'init',args:{tree,skinMode:'light'}}));
  await initialized;
  port2.dispatchEvent(new Event('messageerror'));await tick();
  await assert.rejects(child.destroy(),error=>error===failure);port1.close();
});

test('child init and fit preserve original name, message, code, stack and stage',async()=>{
  for(const stage of ['init','fit']){
    const failure=Object.assign(new TypeError(`${stage} editor failed`),{code:'E_EDITOR_DETAIL'});
    failure.stack=`TypeError: ${stage} editor failed\n    at editor (xmind-adapter.js:123:4)`;
    const h=harness({rendererFactory:()=>({
      get ready(){return stage==='init'?Promise.reject(failure):Promise.resolve();},nodeCount:1,
      fit(){throw failure;},destroy(){}})});
    if(stage==='fit')await h.api.ready;
    await assert.rejects(stage==='init'?h.api.ready:h.api.fit(),{
      code:failure.code,name:failure.name,message:failure.message,stack:failure.stack,mindmapStage:`frame.${stage}`});
    await h.api.destroy();
  }
});

test('null child throws settle as an init or fit diagnostic rather than timing out',async()=>{
  for(const stage of ['init','fit']){
    const h=harness({rendererFactory:()=>{
      if(stage==='init')throw null;
      return {ready:Promise.resolve(),nodeCount:1,fit(){throw null;},destroy(){}};
    }});
    if(stage==='fit')await h.api.ready;
    await assert.rejects(stage==='init'?h.api.ready:h.api.fit(),{
      code:'E_XMIND_RENDER',mindmapStage:`frame.${stage}`,message:'Non-Error throw (null)'});
    await h.api.destroy();
  }
});

test('init rejection remains primary when retiring its resource also rejects',async()=>{
  const primary=Object.assign(new TypeError('initialization failed'),{code:'E_PRIMARY_INIT'});
  primary.stack='TypeError: initialization failed\n    at init (xmind-adapter.js:12:3)';
  const cleanup=Object.assign(new Error('retirement failed'),{code:'E_SECONDARY_CLOSE'});
  const h=harness({rendererFactory:()=>({get ready(){return Promise.reject(primary);},nodeCount:0,
    destroy(){throw cleanup;}})});
  await assert.rejects(h.api.ready,error=>{
    assert.equal(error.code,'E_PRIMARY_INIT');assert.equal(error.name,'TypeError');
    assert.equal(error.message,'initialization failed');assert.equal(error.stack,primary.stack);
    assert.equal(error.mindmapStage,'frame.init');
    assert.equal(error.cleanupErrors[0].code,'E_SECONDARY_CLOSE');
    assert.equal(error.cleanupErrors[0].mindmapStage,'frame.destroy');return true;
  });
  await h.api.destroy();
});

test('destroy acknowledgement failure survives a second resource cleanup failure',async()=>{
  const api=createXmindFrameRenderer({window,canvas:{},tree,timeoutMs:250,
    identity:{instanceId:'A',revision:0},frameFactory:({identity})=>{
      const {port1,port2}=new MessageChannel();
      port2.on('message',data=>port2.postMessage(frameEnvelope(identity,{kind:'reply',id:data.id,
        command:data.command,ok:data.command!=='destroy',nodeCount:1,
        error:{code:'E_CHILD_CLOSE',name:'RangeError',message:'child close failed',stage:'frame.destroy'}})));
      return {port:port1,destroy(){port2.close();throw new Error('parent close failed');}};
    }});
  await api.ready;
  await assert.rejects(api.destroy(),error=>{
    assert.equal(error.code,'E_CHILD_CLOSE');assert.equal(error.message,'child close failed');
    assert.equal(error.cleanupErrors[0].message,'parent close failed');return true;
  });
});

test('foreign and malformed diagnostic replies cannot reject a pending request',async()=>{
  const h=manualPeer();await h.api.ready;
  const next=h.next();let settled=false;
  const operation=h.api.fit().finally(()=>{settled=true;});const request=await next;
  const reply={...request,kind:'reply',ok:false,error:{code:'E_PEER',name:'TypeError',
    message:'fit failed',stack:'at fit (frame.js:12:3)',stage:'frame.fit'}};
  h.foreign(reply);
  for(const mutation of [{sessionId:'foreign'},{instanceId:'other'},{revision:0},
    {id:request.id+1},{command:'setTheme'},
    {error:{...reply.error,stack:'x'.repeat(2401)}},{error:{...reply.error,message:{body:'private'}}}]){
    h.send({...reply,...mutation});
  }
  await delay(20);assert.equal(settled,false);
  h.send(reply);
  await assert.rejects(operation,{code:'E_PEER',name:'TypeError',message:'fit failed',
    stack:'at fit (frame.js:12:3)',mindmapStage:'frame.fit'});
  await h.api.destroy();
});

test('init and setTheme timeouts retain the active command stage',async()=>{
  const gate=deferred();
  const init=harness({timeoutMs:30,rendererFactory:()=>({ready:gate.promise,nodeCount:0,destroy(){gate.resolve();}})});
  await assert.rejects(init.api.ready,{code:'E_XMIND_FRAME_TIMEOUT',mindmapStage:'frame.init'});
  await init.api.destroy();
  const h=manualPeer({timeoutMs:30});await h.api.ready;
  await assert.rejects(h.api.setTheme('dark'),{code:'E_XMIND_FRAME_TIMEOUT',mindmapStage:'frame.setTheme'});
  await h.api.destroy();
});

test('child cleanup preserves the renderer failure if closing its port also throws',async()=>{
  const {port1,port2}=new MessageChannel();
  const identity={sessionId:'private',instanceId:'A',revision:0};
  const failure=new TypeError('renderer close failed');
  const child=serveXmindFrame({port:port2,identity,window,canvas:{},rendererFactory:()=>({
    ready:Promise.resolve(),nodeCount:1,destroy(){throw failure;}})});
  const initialized=new Promise(resolve=>port1.once('message',resolve));
  port1.postMessage(frameEnvelope(identity,{kind:'request',id:1,command:'init',args:{tree,skinMode:'light'}}));
  await initialized;
  const close=port2.close.bind(port2);
  port2.close=()=>{close();throw new Error('port close failed');};
  try{
    await assert.rejects(child.destroy(),error=>{
      assert.equal(error,failure);assert.equal(error.mindmapStage,'frame.destroy');
      assert.equal(error.cleanupErrors[0].message,'port close failed');return true;
    });
  }finally{port1.close();}
});
