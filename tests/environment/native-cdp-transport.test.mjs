import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from '../framework/sidebar-native-session.mjs';

// Component transport only: these simulated responses are never native evidence.
async function withSocket(run,observers={}){
  const original=globalThis.WebSocket;let socket;
  globalThis.WebSocket=class {
    constructor(){socket=this;this.sent=[];queueMicrotask(()=>this.onopen());}
    send(raw){this.sent.push(JSON.parse(raw));}
    receive(message){this.onmessage({data:JSON.stringify(message)});}
    close(){this.onclose?.();}
  };
  let client;
  try{client=await connect('ws://component.test',{onCommand:e=>{socket.commands.push(e);return observers.onCommand?.(e);},onEvent:e=>{socket.events.push(e);return observers.onEvent?.(e);}});socket.commands=[];socket.events=[];await run(client,socket);}
  finally{client?.close();globalThis.WebSocket=original;}
}

test('native CDP correlates replies and retains actual session event envelopes',()=>withSocket(async(client,socket)=>{
  const first=client.send('Page.enable',{},'host'),second=client.send('Target.getTargets');
  socket.receive({method:'Page.javascriptDialogOpening',sessionId:'host',params:{type:'confirm',message:'component only'}});
  socket.receive({id:socket.sent[1].id,result:{targetInfos:[]}});
  socket.receive({id:socket.sent[0].id,result:{}});
  assert.deepEqual(await first,{});assert.deepEqual(await second,{targetInfos:[]});
  assert.equal(socket.commands[0].timeoutMs,15000);
  assert.deepEqual(socket.events,[{method:'Page.javascriptDialogOpening',sessionId:'host',params:{type:'confirm',message:'component only'}}]);
  assert.equal(socket.commands.at(-1).sessionId,'host');
}));

test('native CDP allows a bounded modal deadline and reports timeout without replay',()=>withSocket(async(client,socket)=>{
  await assert.rejects(client.send('Input.dispatchMouseEvent',{},'host',{timeoutMs:20}),/CDP timeout Input.dispatchMouseEvent/);
  assert.equal(socket.sent.length,1);assert.equal(socket.commands.at(-1).phase,'timeout');
  socket.receive({id:socket.sent[0].id,result:{late:true}});
  assert.equal(socket.commands.length,2,'Late reply cannot become a fresh acknowledgment');
}));

test('native CDP rejects disconnected pending commands immediately',()=>withSocket(async(client,socket)=>{
  const first=assert.rejects(client.send('Page.enable',{},'host'),/CDP disconnected Page.enable/);
  const second=assert.rejects(client.send('Runtime.evaluate',{},'tool'),/CDP disconnected Runtime.evaluate/);
  socket.close();await Promise.all([first,second]);
  assert.deepEqual(socket.commands.filter(e=>e.phase==='disconnect').map(e=>e.sessionId),['host','tool']);
}));

test('native CDP rejects unbounded or invalid deadlines before sending input',()=>withSocket(async(client,socket)=>{
  for(const timeoutMs of [0,-1,Infinity,60001,0.5])await assert.rejects(client.send('Input.dispatchMouseEvent',{},'host',{timeoutMs}),/within 1..60000/);
  assert.equal(socket.sent.length,0);
}));

test('native CDP send failure clears its pending timer',()=>withSocket(async(client,socket)=>{
  socket.send=()=>{throw Error('transport closed');};
  await assert.rejects(client.send('Input.dispatchMouseEvent'),/transport closed/);
  socket.close();assert.equal(socket.commands.filter(e=>e.phase==='disconnect').length,0);
}));

test('native CDP refuses send after explicit close or browser disconnect',async()=>{
  for(const disconnect of [client=>client.close(),(_client,socket)=>socket.close()])await withSocket(async(client,socket)=>{
    disconnect(client,socket);await assert.rejects(client.send('Page.enable'),/CDP disconnected Page.enable/);assert.equal(socket.sent.length,0);
  });
});

for(const phase of ['send','reply','timeout','disconnect','event'])test('native CDP observer failure settles and clears pending commands: '+phase,()=>withSocket(async(client,socket)=>{
  const request=client.send('Page.enable',{},'host',{timeoutMs:20});
  const rejected=assert.rejects(request,phase==='disconnect'?/CDP disconnected/:/CDP observer failed: broken observer/);
  if(phase==='reply')socket.receive({id:socket.sent[0].id,result:{}});
  if(phase==='event')socket.receive({method:'Page.javascriptDialogOpening',sessionId:'host',params:{}});
  if(phase==='disconnect')socket.close();
  await rejected;await assert.rejects(client.send('Target.getTargets'),/CDP disconnected/);
},{onCommand:e=>{if(e.phase===phase)throw Error('broken observer');},onEvent:()=>{if(phase==='event')throw Error('broken observer');}}));

for(const thrown of [null,undefined])test('native CDP safely rejects non-Error observer failures: '+String(thrown),()=>withSocket(async(client)=>{
  await assert.rejects(client.send('Page.enable'),/CDP observer failed/);await assert.rejects(client.send('Target.getTargets'),/CDP disconnected/);
},{onCommand:()=>{throw thrown;}}));

test('native CDP rejects async observers without an unhandled rejection',()=>withSocket(async(client)=>{
  await assert.rejects(client.send('Page.enable'),/CDP observers must be synchronous/);await assert.rejects(client.send('Target.getTargets'),/CDP disconnected/);
},{onCommand:async()=>{throw Error('async observer failure');}}));
