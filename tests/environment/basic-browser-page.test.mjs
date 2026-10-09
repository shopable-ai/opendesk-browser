import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {createDemoHttpServer} from '../../examples/tasks/http-test-server.mjs';

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
    'api-url','api-send','api-status',
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

test('async scene uses deterministic same-origin JSON and distinguishes loading, 404, abort and timeout',async()=>{
  const html=await load();
  assert.match(html,/\.\/request-sample\.json/);
  assert.match(html,/\.\/__opendesk_expected_404__\.json/);
  assert.match(html,/fetch\(url, \{cache:'no-store', signal:request\.controller\.signal\}\)/);
  assert.match(html,/new AbortController\(\)/);
  for(const value of ['loading','success','error','timeout','cancelled'])
    assert.match(html,new RegExp(`showAsync\\('${value}'`));
  assert.match(html,/if \(activeRequest !== request\) return/);
  assert.match(html,/showAsync\('idle', '尚未发起请求'\)/);
});


test('scenario 06 is authorized page SDK axiosx, with no native fetch fallback',async()=>{
  const html=await load();
  assert.match(html,/<label class="visually-hidden" for="api-url">请求 URL<\/label>/);
  assert.match(html,/id="api-url"[^>]*value="https:\/\/httpbingo\.org\/get\?source=opendesk"/);
  assert.match(html,/id="api-response"[^>]*data-testid="api-response"/);
  const section=html.match(/<section class="unit" id="lab-api"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section,/OpenDeskSDK\.axiosx\.get/);
  assert.match(section,/id="api-debug-data" hidden aria-hidden="true"/);
  assert.doesNotMatch(section,/此处使用网页 fetch/);
  assert.doesNotMatch(section,/id="api-preset"|id="api-cancel"|<select\b|<textarea\b|<dl\b/);
  assert.equal([...section.matchAll(/<button\b/g)].length,1);
  const code=html.split('async function runApiRequest()')[1]?.split("apiSend.addEventListener('click'")[0];
  assert.ok(code);
  assert.doesNotMatch(code,/\bfetch\s*\(/);
  assert.match(code,/window\.OpenDeskSDK/);
  assert.match(code,/await sdk\.ready\(\)/);
  assert.match(code,/sdk\.axiosx\.get\(url\.href, \{timeout:8000, responseType:'json'\}\)/);
  assert.match(code,/new URL\(input, location\.href\)/);
  assert.match(code,/request\.version !== apiVersion/);
  assert.doesNotMatch(html,/apiResponse\.innerHTML/);
});

function createApiDomHarness(html, handleFetch, sdk) {
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
  nodes.get('api-url').value=initialApiUrl;
  nodes.get('api-debug-data').hidden=true;
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  new Script(scripts[0][1]).runInNewContext({
    document:{
      getElementById(id){return nodes.get(id);},
      createElement(tag){return new FakeNode(tag);}
    },
    window:{OpenDeskSDK:sdk},
    fetch:handleFetch, AbortController, DOMException, URL, TextDecoder, TextEncoder,
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

test('the button calls injected axiosx only after click and safely displays data',async()=>{
  const called=[];
  const sdk={ready:async()=>true,axiosx:{get:async(url,config)=>{
    called.push({url,config});
    return {status:200,statusText:'OK',data:'<h1>HTTP 200</h1>',
      headers:{'content-type':'text/html;charset=utf-8'}};
  }}};
  const dom=createApiDomHarness(await load(),()=>{throw new Error('page fetch must not run');},sdk);
  assert.equal(called.length,0);
  await dom.dispatch('api-send','click');
  assert.equal(called.length,1);
  assert.equal(called[0].url,'https://httpbingo.org/get?source=opendesk');
  assert.deepEqual(JSON.parse(JSON.stringify(called[0].config)),{timeout:8000,responseType:'json'});
  assert.equal(dom.nodes.get('api-status').dataset.state,'success');
  assert.equal(dom.nodes.get('api-http-status').textContent,'200 OK');
  assert.equal(dom.nodes.get('api-content-type').textContent,'text/html;charset=utf-8');
  assert.equal(dom.nodes.get('api-response').textContent,'<h1>HTTP 200</h1>');
  assert.equal(dom.nodes.get('api-debug-data').hidden,true);
  assert.equal(dom.nodes.get('api-send').disabled,false);
});

test('missing SDK / permission denied never issue a fallback page fetch',async()=>{
  const html=await load();
  let pageFetch=0, sdkCalls=0;
  const unexpected=()=>{pageFetch++;throw new Error('native fetch forbidden');};
  const absent=createApiDomHarness(html,unexpected);
  await absent.dispatch('api-send','click');
  assert.equal(absent.nodes.get('api-status').dataset.state,'error');
  assert.match(absent.nodes.get('api-error').textContent,/E_SDK_UNAVAILABLE/);
  const denied=createApiDomHarness(html,unexpected,{ready:async()=>true,axiosx:{get:async()=>{
    sdkCalls++;throw Object.assign(new Error('not authorized'),{code:'E_PERMISSION'});
  }}});
  await denied.dispatch('api-send','click');
  assert.equal(denied.nodes.get('api-status').dataset.state,'error');
  assert.match(denied.nodes.get('api-error').textContent,/E_PERMISSION/);
  assert.equal(sdkCalls,1);assert.equal(pageFetch,0);
});

for (const scenario of [
  {name:'200',path:'/request-sample.json?requestId=r8-page-200',status:200,state:'success'},
  {name:'503',path:'/__test__/status?code=503&requestId=r8-page-503',status:503,state:'error'}
]) test('the HTTP Page draft drives the simulated SDK adapter and reports '+scenario.name,async(t)=>{
  const server=createDemoHttpServer(), requests=[];
  server.on('request',request=>requests.push({method:request.method,url:request.url}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+scenario.path;
  const html=await load(), sent=[];
  // This is a component mock for page → SDK integration, not native browser proof.
  const sdk={ready:async()=>true,axiosx:{get:async(address,config)=>{
    sent.push({address,config});
    const response=await fetch(address,{method:'GET',credentials:'omit'});
    const projection={status:response.status,statusText:response.statusText,
      headers:Object.fromEntries(response.headers.entries()),data:await response.json()};
    if(!response.ok)throw Object.assign(new Error('HTTP '+response.status),
      {code:'E_HTTP',status:response.status,response:projection});
    return projection;
  }}};
  const dom=createApiDomHarness(html,()=>{throw new Error('page fetch forbidden');},sdk);
  const page={
    getByLabel(name,options){
      assert.equal(options.exact,true);
      const labels=[...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]+)<\/label>/g)]
        .filter(match=>match[2]===name);
      assert.equal(labels.length,1,'draft must use a real unique label: '+name);
      const node=dom.nodes.get(labels[0][1]);
      return {async fill(value){node.value=value;await dom.dispatch(node.id,'input');}};
    },
    getByRole(role,options){
      assert.equal(role,'button');assert.equal(options.exact,true);
      const buttons=[...html.matchAll(/<button\b[^>]*id="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
        .filter(match=>match[2]===options.name);
      assert.equal(buttons.length,1,'draft must use the real accessible button name: '+options.name);
      return {async click(){await dom.dispatch(buttons[0][1],'click');}};
    },
    locator(selector){
      const match=/^#([a-z-]+)(?:\[data-state="([^"]+)"\])?$/.exec(selector);
      assert.ok(match,'supported real fixture selector: '+selector);
      const node=dom.nodes.get(match[1]);assert.ok(node);
      return {
        async waitFor(options){
          assert.equal(options.state,'visible');assert.equal(node.hidden,false);
          assert.equal(node.dataset.state,match[2],'wait observes the actual HTTP handler state');
        },
        async textContent(){return node.textContent;}
      };
    }
  };
  const source=await readFile('examples/tasks/http-axiosx-page-draft.js','utf8');
  // Draft+DOM are exercised with an SDK adapter mock: no Chrome/permission acceptance.
  const result=await new Script(source+'\nmain();').runInNewContext({page,params:{url,expected:scenario.state}});
  assert.deepEqual(requests,[{method:'GET',url:scenario.path}]);
  assert.equal(sent.length,1);assert.equal(sent[0].address,url);
  assert.equal(sent[0].config.timeout,8000);
  assert.equal(sent[0].config.responseType,'json');
  assert.equal(result.channel,'page-sdk-axiosx-through-page-api');
  assert.equal(result.url,url);
  assert.match(result.httpStatus,new RegExp('^'+scenario.status+'(?: |$)'));
  const response=JSON.parse(result.responseText);
  if(scenario.status===200)assert.equal(response.source,'opendesk-browser-local-fixture');
  else {assert.equal(response.status,503);assert.match(result.errorText,/E_HTTP.*HTTP 503/);}
});

test('SDK E_HTTP preserves status and input/reset never cause stale success or duplicate calls',async()=>{
  const html=await load(), noFetch=()=>{throw new Error('page fetch forbidden');};
  const rejected=createApiDomHarness(html,noFetch,{
    ready:async()=>true,axiosx:{get:async()=>{throw Object.assign(new Error('HTTP 404'),
      {code:'E_HTTP',status:404,response:{status:404,statusText:'Not Found',
        data:{message:'missing'},headers:{'content-type':'application/json'}}});}}
  });
  await rejected.dispatch('api-send','click');
  assert.equal(rejected.nodes.get('api-status').dataset.state,'error');
  assert.equal(rejected.nodes.get('api-http-status').textContent,'404 Not Found');
  assert.equal(JSON.parse(rejected.nodes.get('api-response').textContent).message,'missing');

  let release, count=0;
  const sdk={ready:async()=>true,axiosx:{get:()=>{count++;return new Promise(resolve=>{release=resolve;});}}};
  const dom=createApiDomHarness(html,noFetch,sdk);
  const running=dom.dispatch('api-send','click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,1);
  dom.nodes.get('api-url').value='https://httpbingo.org/anything';
  await dom.dispatch('api-url','input');
  assert.equal(dom.nodes.get('api-send').disabled,true);
  await dom.dispatch('api-send','click');
  assert.equal(count,1);
  release({status:200,data:'late success',headers:{}});
  await running;
  assert.equal(dom.nodes.get('api-status').dataset.state,'idle');
  assert.equal(dom.nodes.get('api-response').textContent,'');
  assert.equal(dom.nodes.get('api-send').disabled,false);

  let releaseReset, resetCalls=0;
  const reset=createApiDomHarness(html,noFetch,{
    ready:async()=>true,axiosx:{get:()=>{resetCalls++;return new Promise(resolve=>{releaseReset=resolve;});}}
  });
  const pending=reset.dispatch('api-send','click');
  await new Promise(resolve=>setImmediate(resolve));
  await reset.dispatch('reset-all','click');
  releaseReset({status:200,data:'stale response',headers:{}});
  await pending;
  assert.equal(resetCalls,1);
  assert.equal(reset.nodes.get('api-status').dataset.state,'idle');
  assert.equal(reset.nodes.get('api-response').textContent,'');
  assert.equal(reset.nodes.get('api-url').value,'https://httpbingo.org/get?source=opendesk');
});

test('editing URL before SDK ready prevents a network call',async()=>{
  let ready, count=0;
  const dom=createApiDomHarness(await load(),()=>{throw new Error('page fetch forbidden');},{
    ready:()=>new Promise(resolve=>{ready=resolve;}),
    axiosx:{get:async()=>{count++;return {status:200,data:{ok:true}};}}
  });
  const pending=dom.dispatch('api-send','click');
  dom.nodes.get('api-url').value='https://httpbingo.org/status/404';
  await dom.dispatch('api-url','input');
  ready();await pending;
  assert.equal(count,0);
  assert.equal(dom.nodes.get('api-status').dataset.state,'idle');
});

test('minimal axiosx GET UI rejects invalid URLs without sending requests',async()=>{
  let requests=0;
  const dom=createApiDomHarness(await load(),()=>{throw new Error('page fetch forbidden');},{
    ready:async()=>true,axiosx:{get:async()=>{requests++;}}
  });
  dom.nodes.get('api-url').value='javascript:alert(1)';
  await dom.dispatch('api-send','click');
  assert.equal(requests,0);
  assert.equal(dom.nodes.get('api-status').dataset.state,'error');
  assert.match(dom.nodes.get('api-error').textContent,/HTTP\(S\)/);
  dom.nodes.get('api-url').value='https://user:secret@example.com/data';
  await dom.dispatch('api-send','click');
  assert.equal(requests,0,'credential-bearing URL must be rejected');
  assert.equal(dom.nodes.get('api-status').dataset.state,'error');
  assert.equal(dom.nodes.get('api-debug-data').hidden,true);
});


test('Worker axiosx and Page SDK axiosx draft have public HTTPS defaults',async()=>{
  const [worker,pageDraft,html]=await Promise.all([
    readFile('examples/tasks/http-worker-axiosx-draft.js','utf8'),
    readFile('examples/tasks/http-axiosx-page-draft.js','utf8'),
    load()
  ]);
  const endpoint='https://httpbingo.org/get?source=opendesk';
  assert.match(worker,/axiosx\.get\(url, \{timeout:5000, responseType:'json'\}\)/);
  assert.ok(worker.includes("params.url ?? '"+endpoint+"'"));
  assert.ok(pageDraft.includes("params.url ?? '"+endpoint+"'"));
  assert.ok(html.includes('value="'+endpoint+'"'));
  assert.ok(!worker.includes('127.0.0.1:'),'standalone Worker must not require local servers');
  assert.ok(!html.includes('test-response=1'),'self-fetch of the test HTML is no longer used');
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
