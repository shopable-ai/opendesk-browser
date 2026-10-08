import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';

const path='examples/tasks/demo-form.html';
const load=()=>readFile(path,'utf8');

test('one ordinary HTML page exposes unique, stable automation targets',async()=>{
  const html=await load();
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id);
  assert.equal(new Set(ids).size,ids.length,'all DOM IDs must be unique');
  for(const id of [
    'sample-title','sample-text','sample-list','click-button','click-count',
    'toggle-button','extra-text','delay','request-success','request-failure',
    'request-timeout','request-cancel','async-status','async-status-text',
    'async-result','demo-form','name','submit','search-form','keyword',
    'search-submit','search-status','search-count','results','reset-all',
    'api-url','api-preset','api-send','api-cancel','api-status',
    'api-status-text','api-http-status','api-duration','api-content-type',
    'api-response','api-error'
  ]) assert(ids.includes(id),`must provide #${id}`);
  for(const selector of ['sample-title','sample-text'])
    assert.match(html,new RegExp(`id="${selector}"[^>]*data-testid="${selector}"`));
  assert.match(html,/<input id="name"[^>]*required>/);
  assert.match(html,/<label for="name">姓名<\/label>/);
  assert.match(html,/<label for="keyword">搜索关键词<\/label>/);
});

test('the unchanged signed v1 task still targets #name → #submit → #done',async()=>{
  const text=await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8');
  const task=JSON.parse(text);
  assert.equal(task.manifest.taskId,'sample.form-fill');
  assert.equal(task.manifest.siteOrigins[0],'http://127.0.0.1:43111');
  assert.equal(createHash('sha256').update(task.sourceUtf8).digest('hex'),task.manifest.program.sourceHash);
  for(const selector of ["page.type('#name'", "page.click('#submit'", "page.waitForSelector('#done'"])
    assert(task.sourceUtf8.includes(selector),selector);
  const html=await load();
  assert.match(html,/done\.id = 'done'/);
  assert.match(html,/get\('form-result'\)\.append\(done\)/);
  assert.match(html,/get\('done'\)\?\.remove\(\);  \/\/ A new run/);
});

test('modern search retains an initially filled field and deliberately replaces its submit button',async()=>{
  const html=await load();
  assert.match(html,/id="keyword"[^>]*value="旧的预填内容"/);
  assert.match(html,/id="search-submit"/);
  assert.match(html,/old\.cloneNode\(true\)/);
  assert.match(html,/replacement\.disabled = true/);
  assert.match(html,/get\('search-count'\)\.textContent = '提交次数：' \+ \+\+searchCount/);
  assert.match(html,/results\.textContent = '结果：' \+ term/);
});

test('async scene sends only local fetches and distinguishes loading, 404, abort and timeout',async()=>{
  const html=await load();
  assert.match(html,/\.\/demo-form\.html\?test-response=1/);
  assert.match(html,/\.\/__opendesk_expected_404__\.json/);
  assert.match(html,/fetch\(url, \{cache:'no-store', signal:request\.controller\.signal\}\)/);
  assert.match(html,/new AbortController\(\)/);
  for(const value of ['loading','success','error','timeout','cancelled'])
    assert.match(html,new RegExp(`showAsync\\('${value}'`));
  assert.match(html,/if \(activeRequest !== request\) return/);
  assert.match(html,/showAsync\('idle', '尚未发起请求'\)/);
});


test('explicit HTTP GET controls expose safe semantics and preserve offline-first operation',async()=>{
  const html=await load();
  assert.match(html,/<label for="api-url">请求 URL<\/label>/);
  assert.match(html,/id="api-url"[^>]*value="\.\/demo-form\.html\?test-response=1"/);
  assert.match(html,/https:\/\/api\.ipify\.org\?format=json/);
  assert.match(html,/id="api-response"[^>]*data-testid="api-response"/);
  assert.match(html,/credentials:'omit'/);
  assert.match(html,/method:'GET'/);
  assert.match(html,/mode:'cors'/);
  assert.match(html,/new URL\(input, location\.href\)/);
  assert.match(html,/response\.headers\.get\('content-type'\)/);
  assert.match(html,/response\.status/);
  assert.match(html,/activeApi !== request \|\| request\.controller\.signal\.aborted/);
  assert.match(html,/readApiPreview\(response\)/);
  assert.doesNotMatch(html,/apiResponse\.innerHTML/);
});

function createApiDomHarness(html, handleFetch) {
  class FakeNode {
    constructor(id) {
      this.id=id;
      this.value='';
      this.textContent='';
      this.hidden=false;
      this.disabled=false;
      this.dataset={state:'idle'};
      this.listeners=new Map();
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type,[]);
      this.listeners.get(type).push(listener);
    }
    reset() {}
    replaceChildren() { this.textContent=''; }
    setAttribute(name, value) { this[name]=String(value); }
    dispatch(type) {
      return Promise.all((this.listeners.get(type)||[]).map(listener=>listener({
        target:this, preventDefault() {}
      })));
    }
  }
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([,id])=>[id,new FakeNode(id)]));
  // Model the input's actual initial value, not a blank JavaScript stub.
  const initialApiUrl=html.match(/<input id="api-url"[^>]*value="([^"]+)"/)?.[1];
  assert.ok(initialApiUrl);
  nodes.get('api-url').value=initialApiUrl;
  nodes.get('api-preset').value=initialApiUrl;
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  new Script(scripts[0][1]).runInNewContext({
    document:{
      getElementById(id){return nodes.get(id);},
      createElement(tag){return new FakeNode(tag);}
    },
    fetch:handleFetch, AbortController, DOMException, URL, TextDecoder,
    performance, setTimeout, clearTimeout,
    location:{href:'http://127.0.0.1:43111/demo-form.html'}
  },{timeout:2000});
  return {nodes, dispatch:(id,type)=>nodes.get(id).dispatch(type)};
}

test('HTTP panel sends no request until click and shows real status/content without HTML injection',async()=>{
  const seen=[];
  const dom=createApiDomHarness(await load(),(url,options)=>{
    seen.push({url,options});
    return Promise.resolve(new Response('<h1>HTTP 200</h1>',{
      status:200,headers:{'content-type':'text/html;charset=utf-8'}
    }));
  });
  assert.equal(seen.length,0);
  dom.nodes.get('api-url').value='./demo-form.html?test-response=1';
  await dom.dispatch('api-send','click');
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'http://127.0.0.1:43111/demo-form.html?test-response=1');
  assert.equal(seen[0].options.method,'GET');
  assert.equal(seen[0].options.credentials,'omit');
  assert.equal(dom.nodes.get('api-status').dataset.state,'success');
  assert.equal(dom.nodes.get('api-http-status').textContent,'200');
  assert.equal(dom.nodes.get('api-response').textContent,'<h1>HTTP 200</h1>');
  assert.equal(dom.nodes.get('api-response').hidden,false);
  assert.equal(dom.nodes.get('api-cancel').disabled,true);
});

test('HTTP panel preserves actual 404 and abort/reset cannot resurrect late replies',async()=>{
  const html=await load();
  const missing=createApiDomHarness(html,()=>Promise.resolve(new Response('missing',{status:404})));
  await missing.dispatch('api-send','click');
  assert.equal(missing.nodes.get('api-status').dataset.state,'error');
  assert.equal(missing.nodes.get('api-http-status').textContent,'404');
  assert.match(missing.nodes.get('api-error').textContent,/HTTP 404/);

  let deliver;
  const cancelled=createApiDomHarness(html,()=>new Promise(resolve=>{deliver=resolve;}));
  const running=cancelled.dispatch('api-send','click');
  await cancelled.dispatch('api-cancel','click');
  deliver(new Response('late reply',{status:200}));
  await running;
  assert.equal(cancelled.nodes.get('api-status').dataset.state,'cancelled');
  assert.equal(cancelled.nodes.get('api-response').textContent,'');

  let deliverReset;
  const reset=createApiDomHarness(html,()=>new Promise(resolve=>{deliverReset=resolve;}));
  const inFlight=reset.dispatch('api-send','click');
  await reset.dispatch('reset-all','click');
  deliverReset(new Response('stale success',{status:200}));
  await inFlight;
  assert.equal(reset.nodes.get('api-status').dataset.state,'idle');
  assert.equal(reset.nodes.get('api-response').textContent,'');
});

test('inline JavaScript parses without a third-party runtime or external resources',async()=>{
  const html=await load();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.doesNotMatch(html,/<link[^>]+href=/);
});
