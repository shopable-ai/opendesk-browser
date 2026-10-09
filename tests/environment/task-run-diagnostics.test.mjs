import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTaskValue, formatTaskError, formatTaskRunTechnical,
  unresolvedTaskRunMessage} from '../../src/ui/task-run-diagnostics.js';

test('task value presentation bounds output and hides common credential fields', () => {
  const value = {ok:true,accessToken:'do-not-expose',nested:{apiKey:'secret',authToken:'hidden-auth'},
    message:'Bearer secret-header',rows:'x'.repeat(6000)};
  const output = formatTaskValue(value);
  assert.match(output, /"ok": true/);
  assert.doesNotMatch(output, /do-not-expose|hidden-auth|secret-header|"secret"/);
  assert.match(output, /内容已截断/);
  assert(output.length < 4400);
});

test('error presentation removes query secrets and gives a safe unknown-effect next step', () => {
  const error = formatTaskError({code:'E_TIMEOUT',message:
    'Request https://a.example/search?api_key=secret-value failed; Bearer top-secret'});
  assert.match(error, /^E_TIMEOUT：/);
  assert.doesNotMatch(error, /secret-value|top-secret/);
  assert.match(error, /不要直接重复执行/);
  assert.match(formatTaskError({code:'E_PERMISSION',message:'denied'}),/网站权限/);
  assert.match(formatTaskError({code:'E_SELECTOR_UNSUPPORTED'}),/Locator/);
});

test('technical metadata uses only actual identities and never invents source mapping', () => {
  const run={runId:'run-1',state:'failed',revision:{revision:5},
    target:{url:'https://example.com/form?token=123',documentId:'document-1'}};
  const result={resultId:'result-1',revision:{revision:5,sourceHash:'f'.repeat(64)},
    outcome:{error:{code:'E_TIMEOUT'}}};
  const output=formatTaskRunTechnical(run,result);
  assert.match(output,/runId：run-1/);
  assert.match(output,/resultId：result-1/);
  assert.match(output, new RegExp('sourceHash：'+'f'.repeat(64)));
  assert.match(output,/documentId：document-1/);
  assert.match(output,/原始错误码：E_TIMEOUT/);
  assert.doesNotMatch(output,/token=123|sourceMap|行号|调用栈/);
  assert.match(unresolvedTaskRunMessage(),/不要直接重复执行/);
});

test('multi-value credentials in free-text diagnostics are fully redacted', () => {
  const error = formatTaskError({code:'E_TIMEOUT',message:
    'Cookie: session_id=first-secret; csrftoken=second-secret\nAuthorization: Basic basic-secret'});
  assert.doesNotMatch(error, /first-secret|second-secret|basic-secret/);
  const value = formatTaskValue({info:'Cookie: a=first-secret; b=second-secret'});
  assert.doesNotMatch(value, /first-secret|second-secret/);
  assert.doesNotMatch(formatTaskError({code:'E_TIMEOUT',message:'Basic basic-secret'}),/basic-secret/);
});
