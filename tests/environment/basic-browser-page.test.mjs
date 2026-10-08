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
    'search-submit','search-status','search-count','results','reset-all'
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

test('legacy async scene uses local fetches and distinguishes loading, 404, abort and timeout',async()=>{
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

test('inline JavaScript parses without a third-party runtime or external resources',async()=>{
  const html=await load();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.doesNotMatch(html,/<link[^>]+href=/);
});


test('R7.1 real HTTP form has stable URL, method, actions, status, timing, error and response targets', async () => {
  const html = await load();
  for (const id of [
    'http-title', 'http-example', 'http-form', 'http-method', 'http-url',
    'http-timeout', 'http-send', 'http-cancel', 'http-status', 'http-status-text',
    'http-code', 'http-duration', 'http-content-type', 'http-error',
    'http-response-details', 'http-response', 'http-post-fields', 'http-body'
  ]) assert.match(html, new RegExp('id="' + id + '"'), 'missing #' + id);
  for (const id of [
    'http-example','http-method','http-url','http-timeout','http-send',
    'http-cancel','http-status','http-code','http-duration','http-error','http-response'
  ]) assert.match(html,new RegExp('id="' + id + '"[^>]*data-testid="' + id + '"'));
  assert.match(html, /id="http-url"[^>]*value="\.\/request-sample\.json"/);
  assert.match(html, /id="http-method"[^>]*><option>GET<\/option><option>POST<\/option>/);
  assert.match(html, /httpForm\.addEventListener\('submit', event =>/);
  assert.match(html, /const response = await fetch\(url\.href, options\)/);
  assert.match(html, /const raw = await response\.text\(\)/);
  assert.match(html, /response\.headers\.get\('content-type'\)/);
  assert.match(html, /JSON\.parse\(raw\)/);
  assert.match(html, /httpResponse\.textContent =/);
  assert.doesNotMatch(html, /httpResponse\.innerHTML\s*=/);
});

test('R7.1 requests only on submit and handles HTTP, network, timeout, cancel, reset and stale completions', async () => {
  const html = await load();
  for (const origin of ['geocoding-api.open-meteo.com','api.open-meteo.com','ipwho.is'])
    assert(html.includes(origin));
  assert.match(html, /httpExample\.addEventListener\('change', \(\) =>/);
  assert.match(html, /httpForm\.addEventListener\('submit', event =>/);
  assert.match(html, /void runHttp\(\)/);
  assert.match(html, /abortActiveHttp\('superseded'\)/);
  assert.match(html, /if \(activeHttp !== req\) return/);
  assert.match(html, /req\.controller\.abort\(\)/);
  assert.match(html, /req\.reason === 'timeout'/);
  assert.match(html, /setHttpState\('cancelled'/);
  assert.match(html, /setHttpState\('error', 'HTTP 请求失败'/);
  assert.match(html, /setHttpState\('error', '网络请求失败'/);
  assert.match(html, /resetHttp\(\)/);
  assert.match(html, /credentials: 'omit'/);
  assert.match(html, /referrerPolicy: 'no-referrer'/);
});
