import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const path='examples/tasks/demo-form.html';
const load=()=>readFile(path,'utf8');

class FakeNode {
  constructor(id, tag='div', attrs={}) {
    this.id=id;
    this.tagName=tag.toUpperCase();
    this.name=attrs.name ?? '';
    this.type=attrs.type ?? '';
    this.value=attrs.value ?? '';
    this.defaultValue=this.value;
    this.textContent=attrs.textContent ?? '';
    this.hidden=Object.hasOwn(attrs,'hidden');
    this.disabled=Object.hasOwn(attrs,'disabled');
    this.dataset={state:attrs['data-state'] ?? 'idle'};
    this.children=[];
    this.listeners=new Map();
    this.attributes={...attrs};
    this.selectedIndex=attrs.selectedIndex ?? 0;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type,[]);
    this.listeners.get(type).push(listener);
  }
  append(...nodes) {
    this.children.push(...nodes);
    this.textContent += nodes.map(node => typeof node === 'string' ? node : node.textContent).join('');
  }
  replaceChildren(...nodes) {
    this.children=[...nodes];
    this.textContent=nodes.map(node => typeof node === 'string' ? node : node.textContent).join('');
  }
  setAttribute(name, value) {
    this.attributes[name]=String(value);
    if (name === 'data-state') this.dataset.state=String(value);
    else this[name]=String(value);
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  remove() {
    this.removed=true;
  }
  reset() {
    this.value=this.defaultValue;
  }
  dispatch(type, init={}) {
    const event={target:this,currentTarget:this,type,preventDefault(){this.defaultPrevented=true;},...init};
    return Promise.all((this.listeners.get(type)||[]).map(listener=>listener(event)));
  }
}

function attrs(raw) {
  const out={};
  for (const [,name,value] of raw.matchAll(/\s([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g)) out[name]=value ?? '';
  return out;
}

function decodeEntities(value) {
  return value.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
}

function createApiDomHarness(html,{fetchImpl=()=>Promise.reject(new Error('unexpected fetch')),sdk}={}) {
  const nodes=new Map();
  for (const match of html.matchAll(/<(input|select|textarea|button|pre|p|div|span|dd|form|output)\b([^>]*)>/g)) {
    const tag=match[1], raw=match[2], a=attrs(raw);
    if (!a.id) continue;
    if (tag === 'textarea') {
      const close=html.indexOf(`</textarea>`,match.index);
      const body=html.slice(match.index + match[0].length, close);
      a.value=decodeEntities(body);
    }
    nodes.set(a.id,new FakeNode(a.id,tag,a));
  }
  for (const select of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const a=attrs(select[1]);
    if (!a.id || !nodes.has(a.id)) continue;
    const options=[...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
    const selected=Math.max(0,options.findIndex(option=>Object.hasOwn(attrs(option[1]),'selected')));
    const selectedOption=options[selected] ?? options[0];
    nodes.get(a.id).selectedIndex=selected;
    nodes.get(a.id).value=attrs(selectedOption?.[1] ?? '').value ?? selectedOption?.[2]?.replace(/<[^>]+>/g,'').trim() ?? '';
    nodes.get(a.id).defaultValue=nodes.get(a.id).value;
  }
  for (const button of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const a=attrs(button[1]);
    if (a.id && nodes.has(a.id)) nodes.get(a.id).textContent=button[2].replace(/<[^>]+>/g,'').trim();
  }

  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const fetchCalls=[];
  const fetchWrapper=(url,options={})=>{
    fetchCalls.push({url:String(url),options});
    return fetchImpl(url,options);
  };
  const timers=new Set();
  const context={
    document:{
      getElementById(id){return nodes.get(id);},
      createElement(tag){return new FakeNode('',tag);}
    },
    window:{},
    fetch:fetchWrapper,
    AbortController,
    DOMException,
    URL,
    TextDecoder,
    TextEncoder,
    performance:{now:()=>Date.now()},
    setTimeout(callback,ms,...args) {
      const timer=setTimeout(()=>{timers.delete(timer); callback(...args);},ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
      clearTimeout(timer);
    },
    location:{href:'http://127.0.0.1:43111/demo-form.html'}
  };
  context.globalThis=context;
  context.window=context;
  if (sdk) context.window.OpenDeskSDK=sdk;
  new Script(scripts[0][1]).runInNewContext(context,{timeout:2000});
  return {
    context,
    nodes,
    fetchCalls,
    dispatch:(id,type='click',init)=>nodes.get(id).dispatch(type,init),
    cleanup:()=>{for (const timer of timers) clearTimeout(timer); timers.clear();}
  };
}

function sdkHarness({ready=async()=>({ready:true}), get, post}={}) {
  const calls=[];
  const sdk={
    ready:async()=>{calls.push({kind:'ready'}); return ready();},
    axiosx:{
      get:async(url,config)=>{calls.push({kind:'get',url,config}); return get ? get(url,config) : {status:200,data:{ok:true},headers:{'content-type':'application/json'}};},
      post:async(url,body,config)=>{calls.push({kind:'post',url,body,config}); return post ? post(url,body,config) : {status:200,data:{ok:true},headers:{'content-type':'application/json'}};}
    }
  };
  return {sdk,calls};
}

function response(data,{status=200,headers={'content-type':'application/json'},statusText='OK'}={}) {
  return {status,statusText,data,headers};
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(condition) {
  for (let i=0;i<20;i++) {
    if (condition()) return;
    await flush();
  }
}

test('R7.2 API panel starts with fetch GET defaults and sends zero requests before click',async()=>{
  const html=await load();
  const dom=createApiDomHarness(html);
  try {
    assert.equal(dom.nodes.get('api-channel').value,'fetch');
    assert.equal(dom.nodes.get('api-method').value,'GET');
    assert.equal(dom.nodes.get('api-timeout').value,'8000');
    assert.equal(dom.nodes.get('api-send').textContent,'发送 GET');
    assert.equal(dom.fetchCalls.length,0);
  } finally {
    dom.cleanup();
  }
});

test('fetch GET keeps the existing real-response preview and credentials omit route',async()=>{
  const dom=createApiDomHarness(await load(),{fetchImpl:(url,options)=>Promise.resolve(new Response('<h1>HTTP 200</h1>',{
    status:200,headers:{'content-type':'text/html;charset=utf-8'}
  }))});
  try {
    dom.nodes.get('api-url').value='./demo-form.html?test-response=1';
    await dom.dispatch('api-send');
    assert.equal(dom.fetchCalls.length,1);
    assert.equal(dom.fetchCalls[0].url,'http://127.0.0.1:43111/demo-form.html?test-response=1');
    assert.equal(dom.fetchCalls[0].options.method,'GET');
    assert.equal(dom.fetchCalls[0].options.credentials,'omit');
    assert.equal(dom.nodes.get('api-response').textContent,'<h1>HTTP 200</h1>');
    assert.equal(dom.nodes.get('api-status').dataset.state,'success');
  } finally {
    dom.cleanup();
  }
});

test('SDK GET awaits ready and calls axiosx.get with absolute URL, timeout and response headers',async()=>{
  const {sdk,calls}=sdkHarness();
  const dom=createApiDomHarness(await load(),{sdk});
  try {
    dom.nodes.get('api-channel').value='sdk';
    dom.nodes.get('api-url').value='/api/probe?x=1';
    dom.nodes.get('api-timeout').value='1234';
    await dom.dispatch('api-send');
    assert.deepEqual(calls.map(call=>call.kind),['ready','get']);
    assert.equal(calls[1].url,'http://127.0.0.1:43111/api/probe?x=1');
    assert.equal(calls[1].config.timeout,1234);
    assert.equal(dom.fetchCalls.length,0);
    assert.match(dom.nodes.get('api-response').textContent,/"ok":\s*true/);
    assert.match(dom.nodes.get('api-headers').textContent,/content-type/);
  } finally {
    dom.cleanup();
  }
});

test('SDK POST routes JSON body through axiosx.post',async()=>{
  const {sdk,calls}=sdkHarness();
  const dom=createApiDomHarness(await load(),{sdk});
  try {
    dom.nodes.get('api-channel').value='sdk';
    dom.nodes.get('api-method').value='POST';
    dom.nodes.get('api-url').value='https://example.test/submit';
    dom.nodes.get('api-timeout').value='8000';
    dom.nodes.get('api-body').value='{"hello":"OpenDesk"}';
    await dom.dispatch('api-send');
    const post=calls.find(call=>call.kind === 'post');
    assert.equal(post.url,'https://example.test/submit');
    assert.deepEqual(JSON.parse(JSON.stringify(post.body)),{hello:'OpenDesk'});
    assert.equal(post.config.timeout,8000);
  } finally {
    dom.cleanup();
  }
});

test('SDK channel without injection fails closed with E_SDK_NOT_INSTALLED and never falls back to fetch',async()=>{
  const dom=createApiDomHarness(await load(),{fetchImpl:()=>Promise.resolve(new Response('fallback'))});
  try {
    dom.nodes.get('api-channel').value='sdk';
    await dom.dispatch('api-send');
    assert.equal(dom.fetchCalls.length,0);
    assert.equal(dom.nodes.get('api-status').dataset.state,'error');
    assert.match(dom.nodes.get('api-error').textContent,/E_SDK_NOT_INSTALLED/);
  } finally {
    dom.cleanup();
  }
});

test('SDK HTTP errors project details.response while preserving code and message',async()=>{
  const error=Object.assign(new Error('Request failed with status code 418'),{
    code:'E_HTTP_TEAPOT',
    details:{response:{status:418,data:{error:'teapot'},headers:{'content-type':'application/json','x-test':'r72'}}}
  });
  const {sdk}=sdkHarness({get:async()=>{throw error;}});
  const dom=createApiDomHarness(await load(),{sdk});
  try {
    dom.nodes.get('api-channel').value='sdk';
    await dom.dispatch('api-send');
    assert.equal(dom.nodes.get('api-status').dataset.state,'error');
    assert.match(dom.nodes.get('api-http-status').textContent,/418/);
    assert.match(dom.nodes.get('api-response').textContent,/"error":\s*"teapot"/);
    assert.match(dom.nodes.get('api-error').textContent,/E_HTTP_TEAPOT/);
    assert.match(dom.nodes.get('api-error').textContent,/Request failed with status code 418/);
    assert.match(dom.nodes.get('api-content-type').textContent,/application\/json/);
  } finally {
    dom.cleanup();
  }
});

test('SDK timeout, permission and network faults keep typed code/message projections',async()=>{
  for (const [code,message] of [
    ['E_TIMEOUT','deadline exceeded'],
    ['E_PERMISSION_DENIED','permission denied'],
    ['E_NETWORK','socket closed']
  ]) {
    const {sdk}=sdkHarness({get:async()=>{throw Object.assign(new Error(message),{code});}});
    const dom=createApiDomHarness(await load(),{sdk});
    try {
      dom.nodes.get('api-channel').value='sdk';
      await dom.dispatch('api-send');
      assert.equal(dom.nodes.get('api-status').dataset.state,'error');
      assert.match(dom.nodes.get('api-error').textContent,new RegExp(code));
      assert.match(dom.nodes.get('api-error').textContent,new RegExp(message));
    } finally {
      dom.cleanup();
    }
  }
});

test('SDK requests cannot be cancelled, but reset, URL and channel changes discard late SDK display',async()=>{
  let finish;
  const {sdk,calls}=sdkHarness({get:()=>new Promise(resolve=>{finish=resolve;})});
  const dom=createApiDomHarness(await load(),{sdk});
  try {
    dom.nodes.get('api-channel').value='sdk';
    const running=dom.dispatch('api-send');
    await waitFor(()=>calls.some(call=>call.kind === 'get'));
    assert.equal(calls.some(call=>call.kind === 'get'),true);
    assert.equal(dom.nodes.get('api-cancel').disabled,true);
    await dom.dispatch('api-cancel');
    assert.notEqual(dom.nodes.get('api-status').dataset.state,'cancelled');
    await dom.dispatch('reset-all');
    finish(response({late:true}));
    await running;
    assert.equal(dom.nodes.get('api-status').dataset.state,'idle');
    assert.equal(dom.nodes.get('api-response').textContent,'');

    let finishUrl;
    const {sdk:nextSdk}=sdkHarness({get:()=>new Promise(resolve=>{finishUrl=resolve;})});
    const changed=createApiDomHarness(await load(),{sdk:nextSdk});
    changed.nodes.get('api-channel').value='sdk';
    const late=changed.dispatch('api-send');
    await waitFor(()=>typeof finishUrl === 'function');
    changed.nodes.get('api-url').value='https://example.test/changed';
    await changed.dispatch('api-url','input');
    finishUrl(response({late:true}));
    await late;
    assert.equal(changed.nodes.get('api-response').textContent,'');
    changed.cleanup();
  } finally {
    dom.cleanup();
  }
});

test('duplicate SDK clicks while active dispatch one call and late reset result stays hidden',async()=>{
  let finish;
  const {sdk}=sdkHarness({get:()=>new Promise(resolve=>{
    finish=resolve;
  })});
  const dom=createApiDomHarness(await load(),{sdk});
  try {
    dom.nodes.get('api-channel').value='sdk';
    const run=dom.dispatch('api-send');
    await flush();
    await dom.dispatch('api-send');
    await dom.dispatch('reset-all');
    finish(response({run:'late'}));
    await run;
    assert.equal(dom.nodes.get('api-response').textContent,'');
  } finally {
    dom.cleanup();
  }
});

test('URL parser rejects restricted, credentialed and invalid targets before network dispatch',async()=>{
  for (const badUrl of ['javascript:alert(1)','https://user:pass@example.test/','ftp://example.test/']) {
    const {sdk,calls}=sdkHarness();
    const dom=createApiDomHarness(await load(),{sdk});
    try {
      dom.nodes.get('api-channel').value='sdk';
      dom.nodes.get('api-url').value=badUrl;
      await dom.dispatch('api-send');
      assert.equal(calls.some(call=>call.kind === 'get' || call.kind === 'post'),false);
      assert.equal(dom.fetchCalls.length,0);
      assert.equal(dom.nodes.get('api-status').dataset.state,'error');
    } finally {
      dom.cleanup();
    }
  }
});
