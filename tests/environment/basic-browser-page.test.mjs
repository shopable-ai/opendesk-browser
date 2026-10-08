import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
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
    'api-url','api-preset','api-channel','api-method','api-timeout','api-post-body','api-post-wrap','api-bridge-hint','api-response-details','api-send','api-cancel','api-status',
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


test('HTTP panel defaults to genuine local JSON and OpenDesk SDK without auto-request',async()=>{
  const html=await load();
  assert.match(html,/<label for="api-url">请求 URL<\/label>/);
  assert.match(html,/id="api-url"[^>]*value="\.\/request-sample\.json"/);
  assert.match(html,/id="api-channel"[^>]*data-testid="api-channel"/);
  assert.match(html,/<option value="axiosx" selected>/);
  assert.match(html,/<option value="fetch">网页 Fetch/);
  assert.match(html,/id="api-method"[^>]*data-testid="api-method"/);
  assert.match(html,/id="api-timeout"/);
  assert.match(html,/id="api-post-body"/);
  assert.match(html,/id="api-response"[^>]*data-testid="api-response"/);
  assert.match(html,/http:\/\/127\.0\.0\.1:43112\/request-sample\.json/);
  assert.match(html,/https:\/\/api\.ipify\.org\?format=json/);
  assert.match(html,/credentials:'omit'/);
  assert.match(html,/mode:'cors'/);
  assert.match(html,/new URL\(input, location\.href\)/);
  assert.match(html,/sdk\.ready\(\)/);
  assert.match(html,/sdk\.axiosx\.get\(url\.href, config\)/);
  assert.match(html,/sdk\.axiosx\.post\(url\.href, body, config\)/);
  assert.match(html,/previous\.mode === 'fetch'/);
  assert.match(html,/后台请求可能继续执行/);
  assert.match(html,/readApiPreview\(response\)/);
  assert.doesNotMatch(html,/apiResponse\.innerHTML/);
});

function createApiDomHarness(html, handleFetch, sdk = null) {
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
  nodes.get('api-channel').value='axiosx';
  nodes.get('api-method').value='GET';
  nodes.get('api-timeout').value='5000';
  nodes.get('api-post-body').value='{"hello":"OpenDesk"}';
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  new Script(scripts[0][1]).runInNewContext({
    document:{
      getElementById(id){return nodes.get(id);},
      createElement(tag){return new FakeNode(tag);}
    },
    fetch:handleFetch, AbortController, DOMException, URL, TextDecoder,
    performance, setTimeout, clearTimeout,
    location:{href:'http://127.0.0.1:43111/demo-form.html'},
    window: {OpenDeskSDK:sdk}
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
  dom.nodes.get('api-channel').value='fetch';
  dom.nodes.get('api-url').value='./request-sample.json';
  await dom.dispatch('api-send','click');
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'http://127.0.0.1:43111/request-sample.json');
  assert.equal(seen[0].options.method,'GET');
  assert.equal(seen[0].options.credentials,'omit');
  assert.equal(dom.nodes.get('api-status').dataset.state,'success');
  assert.equal(dom.nodes.get('api-http-status').textContent,'200');
  assert.equal(dom.nodes.get('api-response').textContent,'<h1>HTTP 200</h1>');
  assert.equal(dom.nodes.get('api-response-details').open,true);
  assert.equal(dom.nodes.get('api-cancel').disabled,true);
});

test('HTTP panel preserves actual 404 and abort/reset cannot resurrect late replies',async()=>{
  const html=await load();
  const missing=createApiDomHarness(html,()=>Promise.resolve(new Response('missing',{status:404})));
  missing.nodes.get('api-channel').value='fetch';
  await missing.dispatch('api-send','click');
  assert.equal(missing.nodes.get('api-status').dataset.state,'error');
  assert.equal(missing.nodes.get('api-http-status').textContent,'404');
  assert.match(missing.nodes.get('api-error').textContent,/HTTP 404/);

  let deliver;
  const cancelled=createApiDomHarness(html,()=>new Promise(resolve=>{deliver=resolve;}));
  cancelled.nodes.get('api-channel').value='fetch';
  const running=cancelled.dispatch('api-send','click');
  await cancelled.dispatch('api-cancel','click');
  deliver(new Response('late reply',{status:200}));
  await running;
  assert.equal(cancelled.nodes.get('api-status').dataset.state,'cancelled');
  assert.equal(cancelled.nodes.get('api-response').textContent,'');

  let deliverReset;
  const reset=createApiDomHarness(html,()=>new Promise(resolve=>{deliverReset=resolve;}));
  reset.nodes.get('api-channel').value='fetch';
  const inFlight=reset.dispatch('api-send','click');
  await reset.dispatch('reset-all','click');
  deliverReset(new Response('stale success',{status:200}));
  await inFlight;
  assert.equal(reset.nodes.get('api-status').dataset.state,'idle');
  assert.equal(reset.nodes.get('api-response').textContent,'');
});


test('axiosx MAIN SDK calls existing facade for actual return projection, not fetch fallback',async()=>{
  let fetchCalls=0;
  const calls=[];
  const sdk={
    ready:async()=>({ready:true,methods:['AXIOS_GET','AXIOS_POST']}),
    axiosx:{
      get:async(url,config)=>{calls.push({method:'GET',url,config});return {status:200,headers:{'content-type':'application/json'},data:{ok:true,source:'network-service'}};},
      post:async(url,body,config)=>{calls.push({method:'POST',url,body,config});return {status:200,headers:{'content-type':'application/json'},data:{received:body}};}
    }
  };
  const dom=createApiDomHarness(await load(),()=>{fetchCalls++;throw Error('fetch must not be called');},sdk);
  await dom.dispatch('api-send','click');
  assert.equal(fetchCalls,0);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://127.0.0.1:43111/request-sample.json');
  assert.equal(calls[0].config.timeout,5000);
  assert.equal(dom.nodes.get('api-status').dataset.state,'success');
  assert.equal(dom.nodes.get('api-http-status').textContent,'200');
  assert.match(dom.nodes.get('api-response').textContent,/"source": "network-service"/);
  dom.nodes.get('api-method').value='POST';
  await dom.dispatch('api-method','change');
  dom.nodes.get('api-url').value='./__test__/echo';
  await dom.dispatch('api-send','click');
  assert.equal(calls.length,2);
  assert.equal(calls[1].method,'POST');
  assert.equal(calls[1].url,'http://127.0.0.1:43111/__test__/echo');
  assert.equal(calls[1].body.hello,'OpenDesk');
  assert.equal(fetchCalls,0);
});

test('uninstalled or non-network SDK errors are explicit and never fall back to fetch',async()=>{
  let fetchCalls=0;
  const noSdk=createApiDomHarness(await load(),()=>{fetchCalls++;throw Error('must not fetch');});
  await noSdk.dispatch('api-send','click');
  assert.equal(noSdk.nodes.get('api-status').dataset.state,'error');
  assert.match(noSdk.nodes.get('api-error').textContent,/E_SDK_UNAVAILABLE/);
  assert.equal(fetchCalls,0);
  const noGrant=createApiDomHarness(await load(),()=>{fetchCalls++;throw Error('must not fetch');},{
    ready:async()=>({ready:true,methods:['APPLOCAL_GETITEM']}),
    axiosx:{get:()=>{throw Error('not authorized');}}
  });
  await noGrant.dispatch('api-send','click');
  assert.match(noGrant.nodes.get('api-error').textContent,/E_CAPABILITY/);
  assert.equal(fetchCalls,0);
});

test('axiosx E_HTTP keeps actual status/response and cancellation discards late UI only',async()=>{
  const html=await load();
  const sdk404={
    ready:async()=>({ready:true,methods:['AXIOS_GET']}),
    axiosx:{get:async()=>{const error=new Error('HTTP 404');error.code='E_HTTP';error.status=404;
      error.response={data:{message:'not found'},headers:{'content-type':'application/json'}};throw error;}}
  };
  const failure=createApiDomHarness(html,()=>{throw Error('unexpected fetch');},sdk404);
  await failure.dispatch('api-send','click');
  assert.equal(failure.nodes.get('api-status').dataset.state,'error');
  assert.equal(failure.nodes.get('api-http-status').textContent,'404');
  assert.match(failure.nodes.get('api-response').textContent,/not found/);
  assert.match(failure.nodes.get('api-error').textContent,/E_HTTP/);
  let deliver;
  const sdkLate={
    ready:async()=>({ready:true,methods:['AXIOS_GET']}),
    axiosx:{get:()=>new Promise(resolve=>{deliver=resolve;})}
  };
  const late=createApiDomHarness(html,()=>{throw Error('unexpected fetch');},sdkLate);
  const running=late.dispatch('api-send','click');
  await Promise.resolve();await Promise.resolve();
  await late.dispatch('api-cancel','click');
  if (typeof deliver === 'function') deliver({status:200,data:'late',headers:{}});
  await running;
  assert.equal(late.nodes.get('api-status').dataset.state,'cancelled');
  assert.match(late.nodes.get('api-status-text').textContent,/后台请求可能继续执行/);
  assert.equal(late.nodes.get('api-response').textContent,'');
});

test('axiosx Controller Worker and Page API draft files keep their separate boundaries',async()=>{
  const worker=await readFile('examples/tasks/http-worker-axiosx-draft.js','utf8');
  const page=await readFile('examples/tasks/http-axiosx-page-draft.js','utf8');
  assert.match(worker,/async function main\(\)/);
  assert.match(worker,/await axiosx\.get\(url, /);
  assert.doesNotMatch(worker,/window\.OpenDeskSDK|fetch\(/);
  assert.match(page,/async function main\(\)/);
  assert.match(page,/page\.getByLabel\('请求 URL'/);
  assert.match(page,/getByRole\('button', \{name:'发送请求'/);
  assert.doesNotMatch(page,/document\.getElementById|page\.evaluate/);
  assert.doesNotThrow(()=>new Script(worker));
  assert.doesNotThrow(()=>new Script(page));
});

test('inline JavaScript parses without a third-party runtime or external resources',async()=>{
  const html=await load();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.doesNotMatch(html,/<link[^>]+href=/);
});

test('manual browser testing has exactly one canonical HTML and no obsolete advertised URL',async()=>{
  const [files, guide, root, agents] = await Promise.all([
    readdir('examples/tasks'),
    readFile('examples/tasks/README.zh-CN.md','utf8'),
    readFile('README.md','utf8'),
    readFile('AGENTS.md','utf8')
  ]);
  assert.deepEqual(files.filter(file=>file.endsWith('.html')).sort(),['demo-form.html'],
    'examples/tasks must not accumulate duplicate manual browser pages');
  for(const [name,content] of [['guide',guide],['root',root],['agents',agents]]) {
    assert.match(content,/http:\/\/127\.0\.0\.1:43111\/demo-form\.html/,name+' must publish one stable demo URL');
    assert.doesNotMatch(content,/http:\/\/127\.0\.0\.1:\d+\/fixture\b/,name+' must not advertise a legacy temporary fixture URL');
  }
  assert.match(root,/python3 -m http\.server 43111 --bind 127\.0\.0\.1 --directory examples\/tasks/);
});
