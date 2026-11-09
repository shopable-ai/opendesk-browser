import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/environment.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm'
});
const { configureEnvironment } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ save = async () => 'saved', ui } = {}) {
  const states = [];
  const env = configureEnvironment({ setState: value => states.push(value) }, null, {
    trusted: true, ui, preview: { service: {
      async load() { return { etag: 'initial', config: {
        managed: false, schemaVersion: 2, selection: { mode: 'system' },
        endpoints: [], profiles: [], rules: [], sources: [], defaultTarget: { action: 'direct' }
      } }; },
      save,
      async status() { return { state: 'disabled', canStop: false, control: 'controllable_by_this_extension', reason: null }; }
    } }
  });
  return { env, states };
}

test('clean confirmation publishes busy until accept or cancel without changing dirty', async () => {
  for (const accepted of [true, false]) {
    const { env, states } = fixture();
    const answer = deferred();
    try {
      env.setConfirmHandler(text => {
        assert.equal(text, 'Delete?');
        assert.deepEqual(states.at(-1), { dirty: false, busy: true });
        return answer.promise;
      });
      const confirmation = env.confirm('Delete?');
      assert.deepEqual(states.at(-1), { dirty: false, busy: true });
      env.setState({ busy: false });
      assert.equal(states.at(-1).busy, true);
      answer.resolve(accepted);
      assert.equal(await confirmation, accepted);
      assert.deepEqual(states.at(-1), { dirty: false, busy: false });
    } finally { env.dispose(); }
  }
});

test('confirmation finally releases busy on synchronous throw or asynchronous rejection', async () => {
  for (const asynchronous of [false, true]) {
    const { env, states } = fixture();
    const failure = Error('confirmation failed');
    try {
      env.setDraftDirty(true, 'proxy');
      env.setConfirmHandler(() => {
        assert.deepEqual(states.at(-1), { dirty: true, busy: true });
        if (asynchronous) return Promise.reject(failure);
        throw failure;
      });
      assert.equal(await env.confirm('Delete?'), false);
      assert.deepEqual(states.at(-1), { dirty: true, busy: false });
    } finally { env.dispose(); }
  }
});

test('missing confirmation handler returns false without publishing busy', async () => {
  const { env, states } = fixture();
  try {
    assert.equal(await env.confirm('Delete?'), false);
    assert.deepEqual(states, []);
  } finally { env.dispose(); }
});

test('confirmation and mutation release only their own pending count in either completion order', async () => {
  for (const confirmFirst of [true, false]) {
    const saving = deferred(), started = deferred(), answer = deferred();
    const { env, states } = fixture({ save: () => { started.resolve(); return saving.promise; } });
    try {
      const request = env.request({ type: 'SELECT', selection: { mode: 'direct' } });
      await started.promise;
      env.setConfirmHandler(() => answer.promise);
      const confirmation = env.confirm('Delete?');
      if (confirmFirst) {
        answer.resolve(false);
        assert.equal(await confirmation, false);
      } else {
        saving.resolve('saved');
        assert.equal((await request).ok, true);
      }
      env.setState({ busy: false });
      assert.deepEqual(states.at(-1), { dirty: false, busy: true });
      if (confirmFirst) {
        saving.resolve('saved');
        assert.equal((await request).ok, true);
      } else {
        answer.resolve(true);
        assert.equal(await confirmation, true);
      }
      assert.deepEqual(states.at(-1), { dirty: false, busy: false });
    } finally { env.dispose(); }
  }
});

test('second confirmation never overwrites the original resolver', async () => {
  const {env,states}=fixture(),answer=deferred();let calls=0;
  try {
    env.setConfirmHandler(()=>{calls++;return answer.promise;});
    const first=env.confirm('First?');
    assert.equal(await env.confirm('Second?'),false);
    assert.equal(calls,1);assert.equal(states.at(-1).busy,true);
    answer.resolve(true);assert.equal(await first,true);
    assert.equal(states.at(-1).busy,false);
  } finally {env.dispose();}
});

test('disposed confirmation cannot approve or publish into a replacement environment', async () => {
  const old = fixture(), answer = deferred();
  old.env.setConfirmHandler(() => answer.promise);
  const confirmation = old.env.confirm('Delete?');
  old.env.dispose();
  const published = old.states.length;
  const replacement = fixture();
  try {
    answer.resolve(true);
    assert.equal(await confirmation,false);
    let invoked = false;
    old.env.setConfirmHandler(() => { invoked = true; return true; });
    assert.equal(await old.env.confirm('Retry?'),false);
    assert.equal(invoked, false);
    assert.equal(old.states.length, published);
    assert.deepEqual(replacement.states, []);
    assert.equal(await replacement.env.confirm('Delete?'), false);
  } finally { replacement.env.dispose(); }
});


test('injected UI is called synchronously with options and only action confirm approves',async()=>{
 for(const result of [{action:'confirm'},{action:'cancel',reason:'escape'},true,{},null]){
  let called=false;const {env}=fixture({ui:{confirm(options,client){
   called=true;assert.equal(options.message,'Delete?');assert.equal(typeof options.title,'string');
   assert.ok(client.signal instanceof AbortSignal);return Promise.resolve(result);
  }}});
  try {const answer=env.confirm('Delete?');assert.equal(called,true);assert.equal(await answer,result?.action==='confirm');}
  finally {env.dispose();}
 }
});

test('only explicit pre-send unavailable falls back; busy, timeout, rejection and cancel never do',async()=>{
 for(const code of ['E_UI_CONFIRM_UNAVAILABLE','E_UI_CONFIRM_BUSY','E_TIMEOUT','E_UI_CONFIRM_INPUT','E_TOOL_CHANGED']){
  for(const sync of [false,true]){
   let local=0;const failure=Object.assign(Error(code),{code});
   const {env}=fixture({ui:{confirm(){if(sync)throw failure;return Promise.reject(failure);}}});
   try {env.setConfirmHandler(()=>{local++;return true;});assert.equal(await env.confirm('Delete?'),code==='E_UI_CONFIRM_UNAVAILABLE');assert.equal(local,code==='E_UI_CONFIRM_UNAVAILABLE'?1:0);}
   finally {env.dispose();}
  }
 }
});

test('abort, expiry and handler cleanup settle promptly and consume late rejections',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const ending of ['abort','expiry','cleanup','dispose']){
  const answer=deferred();let signal;
  const {env,states}=fixture();
  const release=env.setConfirmHandler((_text,client)=>{signal=client.signal;return answer.promise;});
  const client=new AbortController(),pending=env.confirm('Delete?',{signal:client.signal});
  if(ending==='abort')client.abort();
  if(ending==='expiry'){t.mock.timers.tick(119999);assert.equal(states.at(-1).busy,true);t.mock.timers.tick(1);}
  if(ending==='cleanup')release();
  if(ending==='dispose')env.dispose();
  assert.equal(await pending,false);assert.equal(signal.aborted,true);
  answer.reject(Error('late failure'));await new Promise(setImmediate);
  env.dispose();
 }
});

test('abort cannot replace an already delivered confirm and prevents a late confirm or unavailable fallback',async()=>{
 for(const late of ['confirm','unavailable']){
  const reply=deferred(),controller=new AbortController();let locals=0;
  const {env}=fixture({ui:{confirm:()=>reply.promise}});
  try {
   env.setConfirmHandler(()=>{locals++;return true;});
   const pending=env.confirm('Delete?',{signal:controller.signal});controller.abort();
   assert.equal(await pending,false);
   if(late==='confirm')reply.resolve({action:'confirm'});else reply.reject({code:'E_UI_CONFIRM_UNAVAILABLE'});
   await new Promise(setImmediate);assert.equal(locals,0);
  }finally {env.dispose();}
 }
 const controller=new AbortController(),{env}=fixture({ui:{confirm:async()=>({action:'confirm'})}});
 try{assert.equal(await env.confirm('Delete?',{signal:controller.signal}),true);controller.abort();}
 finally{env.dispose();}
});

test('tool.ui injection is the default and pre-aborted calls never reach it',async()=>{
 let calls=0;
 const env=configureEnvironment({ui:{async confirm(){calls++;return {action:'confirm'};}}},null,{trusted:true});
 try{
  const controller=new AbortController();controller.abort();
  assert.equal(await env.confirm('Delete?',{signal:controller.signal}),false);assert.equal(calls,0);
  assert.equal(await env.confirm('Delete?'),true);assert.equal(calls,1);
 }finally{env.dispose();}
});

test('an obsolete handler cleanup cannot abort a new confirmation or clear its resolver',async()=>{
 const {env}=fixture(),first=deferred(),second=deferred();
 try{
  const obsolete=env.setConfirmHandler(()=>first.promise),one=env.confirm('First?');
  env.setConfirmHandler(()=>second.promise);assert.equal(await one,false);
  const two=env.confirm('Second?');obsolete();second.resolve(true);assert.equal(await two,true);
  first.reject(Error('obsolete late rejection'));await new Promise(setImmediate);
 }finally{env.dispose();}
});
