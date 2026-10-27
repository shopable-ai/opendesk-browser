// R2 official React source-bound contract. Never equate this with Chrome native acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const base='examples/sidebar-tools/ai-vip-share/';
const read=relative=>readFile(base+relative,'utf8');
const [view,controller,style,entry,configRaw,preview,previewEntry]=await Promise.all(
  ['src/App.jsx','src/main.js','src/style.css','src/main.jsx',
    'tool.config.json','preview/index.html','preview/main.jsx'].map(read));
const config=JSON.parse(configRaw);
const ids=[...view.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);

test('one React app owns exactly one root and all controller-required nodes',()=>{
  assert.equal(ids.length,new Set(ids).size);
  assert.match(entry,/createRoot\(mount\)/);
  assert.match(entry,/root\.unmount\(\)/);
  assert.match(entry,/import VipApp from '\.\/App\.jsx'/);
  assert.match(view,/<main className="ai-vip"/);
  assert.match(view,/useLayoutEffect/);
  assert.match(controller,/__OpenDeskVipStart=mountController/);
  const testOnly=new Set(['ai-vip-local-development','ai-vip-local-connect','ai-vip-local-status',
    'ai-vip-shared-section','ai-vip-shared-account','ai-vip-shared-status']);
  for(const [,id] of controller.matchAll(/\bbyId\('([^']+)'\)/g))
    if(!testOnly.has(id))assert.ok(ids.includes(id),'Missing React product target '+id);
  for(const id of testOnly)assert.ok(!ids.includes(id),'Developer UI leaked into product: '+id);
  assert.equal(ids.filter(id=>id==='ai-vip-proxy-toggle').length,1);
  assert.ok(ids.includes('ai-vip-shared-receive'),'Only a conditional website-session retry remains');
  assert.equal(ids.filter(id=>id==='ai-vip-redeem-confirm').length,1);
  assert.equal(ids.filter(id=>id==='ai-vip-secondary-metrics').length,1);
  assert(!ids.includes('ai-vip-benefits')&&!ids.includes('ai-vip-benefits-section'),
    'A separate 我的权益 block is forbidden');
  assert.doesNotMatch(view,/我的权益/);
  assert.match(controller,/secondaryMetrics\.textContent=extras\.map/);
});

test('member-first product structure reuses official Shared UI and never clones Host',()=>{
  for(const name of ['Button','IconButton','Card','CardContent'])
    assert.match(view,new RegExp('\\b'+name+'\\b'));
  const order=['ai-vip-brand','ai-vip-membership','ai-vip-redeem',
    'ai-vip-cookie-section','ai-vip-shop','ai-vip-proxy','ai-vip-desktop-promo'];
  const indices=order.map(v=>view.indexOf(v));
  assert(indices.every((v,i)=>v>0&&(i===0||v>indices[i-1])));
  assert.doesNotMatch(view,/<h1\b|功能与接入状态|服务与开发信息|本地开发|演示步骤|ai-vip-feature-|ai-vip-local-connect|公司共享账号|ai-vip-shared-section|ai-vip-shared-account/);
  assert.match(view,/aria-label="AI VIP Share 会员与权益中心"/);
  assert.match(view,/id="ai-vip-redeem-code"[^>]*type="text"[^>]*data-sensitive/);
  assert.doesNotMatch(view,/PREVIEW-RECEIPT|DEMO-ACCESS|example\.com|演示网站访问|公司共享账号/);
  assert.match(view,/id="ai-vip-redeem-code"[^>]*type="text"[^>]*data-sensitive/);
  assert.equal(ids.filter(id=>id==='ai-vip-shop-open').length,1);
  assert.equal(ids.filter(id=>id==='ai-vip-desktop-open').length,1);
  assert.match(view,/电脑端推荐/);
  assert.doesNotMatch(view,/id="ai-vip-code-reveal"/);
  assert.doesNotMatch(controller,/window\.open\(|chrome\.cookies|chrome\.proxy\.settings/);
});

test('redemption stays review-first and unresolved side effects retain journals',()=>{
  assert.match(view,/id="ai-vip-redeem"[^>]*type="submit"/);
  assert.match(view,/id="ai-vip-redeem-confirm"[^>]*>确认激活</);
  assert.match(controller,/await beginRecovery\(accountId,key,redemptionIntent\)/);
  assert.match(controller,/const RECOVERY_KEY='aiVipRedeemR52'/);
  assert.match(controller,/RECOVERY_COMPAT_VERSIONS=Object\.freeze/);
  assert.match(controller,/'1\.4\.0','1\.4\.1','1\.4\.2'/);
  assert.match(controller,/browser\.cookies\.setMany\(delivery\.payload\)/);
  assert.match(controller,/await sdk\.requestDisable\(\)/);
  assert.match(controller,/const APPROVED_PROXY_ENDPOINT=null/);
  assert.match(controller,/const COOKIE_TARGETS=Object\.freeze\(\[\]\)/);
  assert.doesNotMatch(controller,/localStorage|sessionStorage/);
});

test('formal package references one compiled React UI and immutable business safeguards',async()=>{
  assert.equal(config.id,'ai-vip-share');
  assert.equal(config.version,'1.4.2');
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(config.files,{html:'src/index.html',css:'dist/tool.css',js:'dist/tool.js'});
  const pkg=await createSidebarToolPackage(base);
  assert.equal(pkg.version,'1.4.2');
  assert.equal(pkg.html.trim(),'<div id="tool-app"></div>');
  assert.match(pkg.js,/OpenDeskPageReact/);
  assert.match(pkg.js,/OpenDeskSidebarUI/);
  assert.match(pkg.css,/opendesk\.shared-design\.v1/);
  assert.match(pkg.css,/ai-vip-membership/);
  assert.match(pkg.css,/ai-vip-secondary-metrics/);
  assert.doesNotMatch(pkg.css,/\.ai-vip-benefits\{/);
  assert.match(pkg.css,/\.ai-vip-brand/);
  assert.match(pkg.css,/\.ai-vip-desktop-promo/);
  assert.deepEqual(pkg.capabilities,config.capabilities);
  const ready=JSON.parse(await read('dist/build-ready.json'));
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  for(const name of ['src/App.jsx','src/main.js','src/main.jsx',
    'src/style.css','tool.config.json','vite.config.mjs']){
    const bytes=await readFile(base+name);
    assert.equal(ready.sources[name].sha256,createHash('sha256').update(bytes).digest('hex'));
  }
});

test('preview imports the same React source, isolates fixture and leaves product flags disabled',()=>{
  assert.match(preview,/id="preview-controls"/);
  assert.doesNotMatch(preview,/id="preview-switch"|切换账号 A \/ B/);
  assert.match(preview,/value="quota"|value="expired"/);
  assert.match(preview,/<div id="tool-root"><div id="tool-app"><\/div><\/div>/);
  assert.doesNotMatch(view,/id="preview-|DEMO-VIP-01|<h1\b/);
  assert.match(preview,/\.\/main\.jsx/);
  assert.match(previewEntry,/await import\('\.\.\/src\/main\.jsx'\)/);
  assert.match(previewEntry,/installPreviewFixture/);
  assert.match(configRaw,/"browser\.cookies\.write"/);
  assert.match(view,/id="ai-vip-member-facts"[^>]*hidden/);
  assert.match(view,/id="ai-vip-redeem-form"[^>]*hidden/);
  assert.match(view,/id="ai-vip-shop-section"/);
  assert.doesNotMatch(view,/id="ai-vip-shop-section"[^>]*hidden/);
  assert.match(view,/id="ai-vip-proxy-toggle"[^>]*hidden/);
  assert.match(controller,/toggle\.hidden=!stop&&!ready/);
  assert.match(controller,/redeemForm\.hidden=!showForm/);
  assert.doesNotMatch(view,/<select[^>]*id="ai-vip-shared-account"/);
  assert.match(controller,/storeRequest\('currentPage\.info'\)/);
  assert.match(controller,/const PRODUCT_CATALOG_URL='';/);
  assert.match(controller,/const DESKTOP_CLIENT_URL='';/);
  assert.match(controller,/bindPromotion\(shop,shopStatus,catalog,'商品目录'\)/);
  assert.match(controller,/bindPromotion\(desktopOpen,desktopStatus,desktopClient,'桌面客户端'\)/);
  assert.match(controller,/shopSdk\.create\(\{url\}\)/);
  assert.doesNotMatch(controller,/codeReveal|code\.type='password'/);
});

test('320px and 360px shared-theme CSS remains declared',()=>{
  assert.match(style,/^\/\* @opendesk-shared-design \*\//);
  assert.match(style,/@media\(max-width:360px\)/);
  assert.match(style,/@media\(max-width:320px\)/);
  assert.match(style,/--od-paper/);
  assert.match(style,/\.ai-vip-redeem-inputs\{display:flex/);
  assert.match(style,/\.ai-vip-code-field>\.od-icon-button\{position:absolute/);
  assert.doesNotMatch(style,/grid-template-columns:minmax\(0,1fr\) 36px 36px/);
  assert.match(style,/\[hidden\]\{display:none!important\}/);
});
