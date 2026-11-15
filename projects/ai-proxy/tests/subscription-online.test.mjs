import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadSubscriptionTextWithSdk as download, downloadSubscriptionText,
  SubscriptionDownloadError, SUBSCRIPTION_SDK_DOWNLOAD_MAX_BYTES } from '../src/subscription/download.ts';

const url = 'https://provider.example.com/sub?token=PRIVATE';
const host = 'provider.example.com';
const rejectsCode = (pending, code) => assert.rejects(pending, error => {
  assert.ok(error instanceof SubscriptionDownloadError);
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.cause, undefined);
  assert.ok(!JSON.stringify(error).includes('PRIVATE'));
  return true;
});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };

test('SDK dispatch is synchronous and uses the public GET text contract', async () => {
  const calls = [];
  const pending = download(url, host, request => { calls.push(request); return Promise.resolve({status:200,data:'socks5://proxy.example.com:1080'}); });
  assert.deepEqual(calls, [{method:'GET',url,config:{timeout:15000,responseType:'text'}}]);
  assert.equal(await pending, 'socks5://proxy.example.com:1080');
});

test('SDK rejects non-exact origins and unsafe/private URL shapes before dispatch', async () => {
  let calls = 0;
  for (const input of ['http://provider.example.com/sub','https://user:PRIVATE@provider.example.com/sub',
    'https://provider.example.com:444/sub','https://provider.example.com/sub#PRIVATE',
    'https://127.0.0.1/sub','https://2130706433/sub','https://[::1]/sub','https://localhost/sub',
    'https://service.internal/sub','https://provider.example.com.local/sub','https://provider.example.com/sub\nPRIVATE']) {
    await rejectsCode(download(input, host, () => { calls++; }), 'invalid-url');
  }
  for (const input of ['https://other.example.com/sub','https://sub.provider.example.com/sub',
    'https://provider.example.com.attacker.com/sub']) {
    await rejectsCode(download(input, host, () => { calls++; }), 'origin-mismatch');
  }
  assert.equal(calls, 0);
});

test('SDK redacts synchronous and asynchronous errors, including forged fixed errors', async () => {
  for (const error of [new Error(url), url, {message:url,code:url}, new SubscriptionDownloadError(url)]) {
    await rejectsCode(download(url, host, () => { throw error; }), 'fetch-failed');
    await rejectsCode(download(url, host, () => Promise.reject(error)), 'fetch-failed');
  }
});

test('SDK classifies status, text shape, empty response and byte/escaped IPC bounds', async () => {
  for (const [response, code] of [
    [{status:302,data:url},'redirect-refused'], [{status:404,data:url},'http-error'],
    [{status:0,data:url},'http-error'], [{status:NaN,data:url},'http-error'],
    [{status:200,data:{}},'encoding-invalid'], [{status:200,data:''},'empty-response'],
    [{status:204,data:' \n\t'},'empty-response'],
    [{status:200,data:'a'.repeat(64001)},'response-too-large'],
    [{status:200,data:'界'.repeat(21334)},'response-too-large'],
    [{status:200,data:'\u0000'.repeat(14000)},'response-too-large'],
    [{status:200,data:'"'.repeat(40000)},'response-too-large']
  ]) await rejectsCode(download(url, host, async () => response), code);
  const maximum = 'a'.repeat(SUBSCRIPTION_SDK_DOWNLOAD_MAX_BYTES);
  assert.equal(await download(url, host, async () => ({status:200,data:maximum})), maximum);
  const unicode = '界'.repeat(21333) + 'a';
  assert.equal(await download(url, host, async () => ({status:200,data:unicode})), unicode);
});

test('SDK cancellation settles local wait, prevents pre-cancelled dispatch and ignores late success/error', async () => {
  const pre = new AbortController(); pre.abort(url);
  await rejectsCode(download(url, host, () => assert.fail('must not dispatch'), {signal:pre.signal}), 'cancelled');
  for (const lateReject of [false,true]) {
    const controller = new AbortController(), request = deferred();
    let calls = 0;
    const pending = download(url, host, () => { calls++; return request.promise; }, {signal:controller.signal});
    controller.abort(new Error(url));
    await rejectsCode(pending, 'cancelled');
    assert.equal(calls, 1, 'on-wire dispatch is not undone');
    if (lateReject) request.reject(new Error(url));
    else request.resolve({status:200,data:url});
    await new Promise(setImmediate);
    await rejectsCode(pending, 'cancelled');
  }
});

test('SDK timeout is distinct from cancellation and consumes late results', async () => {
  for (const lateReject of [false,true]) {
    const controller = new AbortController(), request = deferred();
    const pending = download(url, host, () => request.promise, {timeoutMs:2,signal:controller.signal});
    await rejectsCode(pending, 'timeout');
    controller.abort();
    if (lateReject) request.reject(new Error(url));
    else request.resolve({get status(){ assert.fail('late response must not be inspected'); }});
    await new Promise(setImmediate);
    await rejectsCode(pending, 'timeout');
  }
});

test('native fetch helper retains its streaming CLI contract', async () => {
  const calls = [];
  assert.equal(await downloadSubscriptionText(url, host, {fetchImpl:async (...args) => {
    calls.push(args); return new Response('native text');
  }}), 'native text');
  assert.equal(calls[0][1].redirect, 'manual');
  assert.equal(calls[0][1].credentials, 'omit');
  await rejectsCode(downloadSubscriptionText(url, host, {fetchImpl:async () => new Response('large'),maxBytes:2}), 'response-too-large');
});

test('SDK permission, deadline and size failures retain fixed recovery categories',async()=>{
 for(const [code,expected] of Object.entries({E_PERMISSION:'permission-denied',E_CAPABILITY:'permission-denied',E_NETWORK_NOT_SUBMITTED:'permission-denied',E_TOOL_CHANGED:'permission-denied',E_TIMEOUT:'timeout',E_LIMIT:'response-too-large',E_HTTP:'http-error'})){
  const error=Object.assign(Error(url),{code});
  await rejectsCode(download(url,host,()=>{throw error;}),expected);
  await rejectsCode(download(url,host,()=>Promise.reject(error)),expected);
 }
});
