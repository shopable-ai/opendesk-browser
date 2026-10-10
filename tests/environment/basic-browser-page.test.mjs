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
    'api-url','api-preset','api-channel','api-method','api-timeout',
    'api-body','api-post-fields','api-headers','api-send','api-cancel',
    'api-status','api-status-text','api-http-status','api-duration',
    'api-content-type','api-response','api-error','api-sdk-guide','api-sdk-origin'
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


test('HTTP panel defaults to public SDK axiosx, with opt-in offline Fetch fixtures',async()=>{
  const html=await load();
  assert.match(html,/<label for="api-url">请求 URL<\/label>/);
  assert.match(html,/id="api-url"[^>]*value="https:\/\/httpbingo\.org\/get\?source=opendesk"/);
  assert.match(html,/<label for="api-channel">/);
  assert.match(html,/<select id="api-channel"[^>]*>/);
  assert.match(html,/<option value="fetch"/);
  assert.match(html,/<option value="sdk" selected>/);
  assert.match(html,/<option value="https:\/\/httpbingo.org\/post" data-method="POST"/);
  assert.match(html,/<label for="api-method">/);
  assert.match(html,/<select id="api-method"[^>]*>/);
  assert.match(html,/<option(?: value="GET")?>GET<\/option>/);
  assert.match(html,/<option(?: value="POST")?>POST<\/option>/);
  assert.match(html,/<label for="api-timeout">/);
  assert.match(html,/id="api-timeout"[^>]*value="8000"/);
  assert.match(html,/<label for="api-body">/);
  assert.match(html,/<textarea id="api-body"/);
  assert.match(html,/<[^>]+id="api-headers"/);
  assert.match(html,/<[^>]+id="api-post-fields"/);
  assert.match(html,/<button id="api-send"[^>]*>发送 GET<\/button>/);
  assert.match(html,/https:\/\/api\.ipify\.org\?format=json/);
  assert.match(html,/id="api-response"[^>]*data-testid="api-response"/);
  assert.match(html,/credentials:'omit'/);
  assert.match(html,/method/);
  assert.match(html,/new URL\(input, location\.href\)/);
  assert.match(html,/response\.headers/);
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
      this.children=[];
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type,[]);
      this.listeners.get(type).push(listener);
    }
    reset() {}
    replaceChildren(...items) { this.textContent=''; this.children=items; }
    append(item) { this.children.push(item); }
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
  for (const input of html.matchAll(/<input\b([^>]*)>/g)) {
    const id=input[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id || !nodes.has(id)) continue;
    nodes.get(id).value=input[1].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    nodes.get(id).defaultValue=nodes.get(id).value;
  }
  nodes.get('api-preset').value=initialApiUrl;
  for (const select of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id=select[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id || !nodes.has(id)) continue;
    const options=[...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
    const selected=Math.max(0,options.findIndex(option=>/\sselected(?:\s|>|=)/.test(option[1])));
    const option=options[selected] ?? options[0];
    nodes.get(id).value=option?.[1].match(/\bvalue="([^"]*)"/)?.[1] ?? option?.[2]?.replace(/<[^>]+>/g,'').trim() ?? '';
  }
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  new Script(scripts[0][1]).runInNewContext({
    document:{
      getElementById(id){return nodes.get(id);},
      createElement(tag){return new FakeNode(tag);}
    },
    window:{}, fetch:handleFetch, AbortController, DOMException, URL, TextDecoder, TextEncoder,
    performance, setTimeout, clearTimeout,
    location:{href:'http://127.0.0.1:43111/demo-form.html'}
  },{timeout:2000});
  return {nodes, dispatch:(id,type)=>nodes.get(id).dispatch(type)};
}

test('the single canonical page exposes seven navigable groups and honest Locator fixtures',async()=>{
  const html=await load();
  for(const id of ['lab-text','lab-click','lab-async','lab-form','lab-search','lab-api','lab-locator']) {
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(html,new RegExp('href="#'+id+'"'));
  }
  for(const id of ['locator-confirm-a','locator-confirm-b','locator-readonly-field',
    'locator-disabled-button','locator-aria-disabled','locator-cover-shield',
    'locator-covered-target','locator-cover-toggle','locator-cover-count',
    'locator-late-launch','locator-late-result','locator-late-status']) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/id="locator-confirm-a" data-testid="locator-confirm-a"/);
  assert.match(html,/id="locator-confirm-b" data-testid="locator-confirm-b"/);
  assert.match(html,/id="locator-readonly-field"[^>]*readonly>/);
  assert.match(html,/id="locator-disabled-button"[^>]*disabled>/);
  assert.match(html,/id="locator-aria-disabled"[^>]*aria-disabled="true"/);
  assert.match(html,/id="locator-cover-shield"/);
  assert.match(html,/button\.dataset\.testid = 'locator-late-target'/);
  assert.match(html,/resetLocatorPlayground\(\);/);
  assert.match(html,/真实 DOM/);
  assert.doesNotMatch(html,/测试全部通过|自动验收 PASS/);
});

test('Locator fixture actions, late insertion, and reset mutate only observable DOM',async()=>{
  const dom=createApiDomHarness(await load(),()=>{throw new Error('unexpected fetch');});
  await dom.dispatch('locator-confirm-a','click');
  assert.equal(dom.nodes.get('locator-duplicate-result').textContent,'实际点击：分区 A');
  await dom.dispatch('locator-confirm-b','click');
  assert.equal(dom.nodes.get('locator-duplicate-result').textContent,'实际点击：分区 B');

  const cover=dom.nodes.get('locator-cover-shield');
  assert.equal(cover.hidden,false);
  await dom.dispatch('locator-cover-toggle','click');
  assert.equal(cover.hidden,true);
  assert.equal(dom.nodes.get('locator-cover-toggle')['aria-pressed'],'true');
  // FakeNode dispatch cannot emulate browser hit-testing. Native Chrome must separately verify occlusion.
  await dom.dispatch('locator-covered-target','click');
  assert.equal(dom.nodes.get('locator-cover-count').textContent,'1');

  await dom.dispatch('locator-late-launch','click');
  assert.equal(dom.nodes.get('locator-late-status').dataset.state,'loading');
  assert.equal(dom.nodes.get('locator-late-result').children.length,0);
  await new Promise(resolve=>setTimeout(resolve,760));
  const targets=dom.nodes.get('locator-late-result').children;
  assert.equal(targets.length,1);
  assert.equal(targets[0].id,'locator-late-target');
  assert.equal(targets[0].dataset.testid,'locator-late-target');
  assert.equal(dom.nodes.get('locator-late-status').dataset.state,'visible');

  await dom.dispatch('locator-late-launch','click');
  await dom.dispatch('reset-all','click');
  assert.equal(dom.nodes.get('locator-late-status').dataset.state,'idle');
  assert.equal(dom.nodes.get('locator-late-result').children.length,0);
  assert.equal(dom.nodes.get('locator-cover-count').textContent,'0');
  assert.equal(cover.hidden,false);
  await new Promise(resolve=>setTimeout(resolve,760));
  assert.equal(dom.nodes.get('locator-late-result').children.length,0,
    'cancelled delayed insertion must not resurrect after reset');
});

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
    assert.doesNotMatch(content,/http:\/\/127\.0\.0\.1:\d+\/(?:fixture|next)\b/,name+' must not advertise legacy temporary fixture/next URLs');
  }
  assert.match(root,/python3 -m http\.server 43111 --bind 127\.0\.0\.1 --directory examples\/tasks/);
});
