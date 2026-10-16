// R5.8 production UI parity guard. This checks source/package contracts, not Chrome pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const toolRoot=fileURLToPath(new URL('../../examples/sidebar-tools/ai-vip-share/',import.meta.url));
const read=path=>readFile(new URL('../../examples/sidebar-tools/ai-vip-share/'+path,import.meta.url),'utf8');
const [html,css,js,preview,configRaw]=await Promise.all([
  read('src/index.html'),read('src/style.css'),read('src/main.js'),
  read('preview/index.html'),read('tool.config.json')
]);
const config=JSON.parse(configRaw);
const idList=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const ids=new Set(idList);
const has=id=>ids.has(id);
const order=(source,terms)=>terms.map(term=>source.indexOf(term));

test('production UI has one stable root, unique IDs, and all JS-bound nodes',()=>{
  assert.match(html,/^<main class="ai-vip"/);
  assert.equal(idList.length,ids.size);
  for(const [,id] of js.matchAll(/\bbyId\('([^']+)'\)/g))
    assert.ok(has(id),'Missing DOM ID for '+id);
  for(const id of ['ai-vip-redeem-form','ai-vip-redeem-confirm','ai-vip-code-reveal',
    'ai-vip-code-clear','ai-vip-meter','ai-vip-meter-bar','ai-vip-metric-label',
    'ai-vip-proxy-toggle','ai-vip-proxy-refresh','ai-vip-proxy-alert'])
    assert.ok(has(id),'Missing production UI control '+id);
  assert.ok(!has('ai-vip-proxy-enable')&&!has('ai-vip-proxy-disable'));
});

test('member-first structure follows R5.7 main tool area; no studio fixture leaks',()=>{
  const terms=['class="ai-vip-brand"','class="ai-vip-membership"',
    'class="ai-vip-redeem"','class="ai-vip-shop"','class="ai-vip-proxy"',
    'class="ai-vip-service"'];
  const locations=order(html,terms);
  assert.ok(locations.every(n=>n>=0));
  assert.deepEqual(locations,[...locations].sort((a,b)=>a-b));
  assert.match(preview,/class="brand"/);
  assert.match(preview,/class="membership"/);
  assert.match(preview,/class="redeem"/);
  assert.match(preview,/class="proxy-card"/);
  assert.match(preview,/class="service"/);
  assert.match(html,/AI VIP Share[\s\S]*会员权益 · 兑换激活 · AI 网站访问/);
  assert.match(html,/<svg[\s\S]*?<\/svg>/);
  assert.doesNotMatch(html+js,/DEMO-ACCESS|PREVIEW-RECEIPT|example\.com|lab-install-confirm|scenario\b|window\.chrome\.proxy/);
});

test('redeem uses actual user submit, preflight, explicit confirmation and masked input',()=>{
  assert.match(html,/<form id="ai-vip-redeem-form"[\s\S]*?type="submit"/);
  assert.match(html,/id="ai-vip-redeem-code"[^>]*type="password"/);
  assert.match(js,/redeemForm\.addEventListener\('submit'/);
  assert.match(js,/confirm\.addEventListener\('click'/);
  assert.match(js,/codeReveal\.addEventListener\('click'/);
  assert.match(js,/codeClear\.addEventListener\('click'/);
  assert.match(js,/const RECOVERY_KEY='aiVipRedeemR52'/);
  assert.match(js,/RECOVERY_COMPAT_VERSIONS=Object\.freeze\(\['1\.2\.0','1\.3\.0','1\.3\.1'\]\)/);
  assert.match(js,/await beginRecovery\(accountId,key\)/);
  assert.match(js,/voucherStatus/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

test('one STOP-priority proxy control never bypasses public Managed SDK',()=>{
  assert.equal((html.match(/id="ai-vip-proxy-toggle"/g)||[]).length,1);
  assert.match(js,/browser\?\.proxy\?\.managed/);
  assert.match(js,/await sdk\.requestDisable\(\)/);
  assert.match(js,/current\?\.canStop===true/);
  assert.match(js,/const APPROVED_PROXY_ENDPOINT=null/);
  assert.doesNotMatch(js,/chrome\.proxy\.settings|aiAccess\.(?:enable|activate)/);
});

test('responsive styling and explicit theme tokens cover narrow Sidebar tool',()=>{
  assert.match(css,/\/\* @opendesk-shared-design \*\//);
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css,/@media\(max-width:320px\)/);
  assert.match(css,/--od-paper/);
  assert.match(css,/minmax\(0,1fr\) 44px 40px/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
});

test('v2 Sidebar Tool candidate builds from the real UI source, not preview',async()=>{
  assert.equal(config.id,'ai-vip-share');
  assert.equal(config.version,'1.3.1');
  assert.equal(config.files.html,'src/index.html');
  assert.equal(config.files.css,'src/style.css');
  assert.equal(config.files.js,'src/main.js');
  const pkg=await createSidebarToolPackage(toolRoot);
  assert.equal(pkg.version,'1.3.1');
  assert.equal(pkg.html,html);
  assert.match(pkg.css,/ai-vip-brand/);
  assert.match(pkg.js,/RECOVERY_COMPAT_VERSIONS/);
});
