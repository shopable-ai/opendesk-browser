// UI preview tests only. Never count these as SDK, Provider, or Chrome Native acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const modelSource=scripts.find(part=>part[0].includes('id="business-preview-model"'))?.[1];
assert.ok(modelSource,'offline model missing');
const context={};runInNewContext(modelSource,context);
const M=context.AIVipBusinessPreview;
test('all five inline scripts parse without syntax errors',()=>{
 assert.equal(scripts.length,5);
 for(const script of scripts) assert.doesNotThrow(()=>new Script(script[1]));
});
test('preview controls remain outside the installed extension shell',()=>{
 const shell=html.indexOf('class="shell"');
 for(const id of ['scenario','preview-width','preview-theme'])
  assert.ok(html.indexOf('id="'+id+'"')<shell,id);
});
test('member then redemption then store then one main proxy control',()=>{
 const order=['class="membership"','class="redeem"','class="bottomline"','class="proxy-card"'].map(marker=>html.indexOf(marker));
 assert.ok(order.every((x,i)=>x>=0&&(i===0||x>order[i-1])));
 assert.equal((html.match(/id="proxy-toggle"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="proxy-mode"|id="proxy-dialog"|id="proxy-confirm"/);
});
test('redeem view includes preflight, confirmation, cancel, masked entry, history and recovery',()=>{
 for(const id of ['redeem-review','review-confirm','review-cancel','history-panel','recovery-check','redeem-feedback'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="redeem-code" type="password"/);
});
test('only known sample code can be previewed',()=>{
 assert.equal(M.preflight('DEMO-ACCESS-2026','member').status,'ready');
 assert.equal(M.preflight('UNKNOWN-123456','member').status,'unavailable');
 assert.equal(M.preflight('invalid!','member').status,'invalid');
 assert.equal(M.preflight('DEMO-ACCESS-2026','blocked').status,'unavailable');
 assert.equal(M.preflight('DEMO-ACCESS-2026','guest').status,'login_required');
 assert.equal(M.preflight('DEMO-ACCESS-2026','recovery').status,'unavailable');
});
test('voucher failures remain distinct',()=>{
 for(const [code,status] of [
  ['DEMO-USED-2026','used'],
  ['DEMO-EXPIRED-2026','expired'],
  ['DEMO-WRONG-ACCOUNT-2026','wrong_account']
 ])assert.equal(M.preflight(code,'member').status,status);
});
test('only verified built-in preview can create a labeled simulated receipt',()=>{
 const known=M.preflight('DEMO-ACCESS-2026','member');
 assert.equal(M.confirm(known).status,'simulated');
 assert.equal(M.confirm({status:'ready',previewId:'fake'}).status,'invalid');
});
test('recovery without real Provider does not claim confirmed redemption',()=>{
 assert.equal(M.recover().status,'unknown');
});
test('both shop links leave the preview through safe external HTTPS tabs',()=>{
 assert.equal((html.match(/href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer"/g)||[]).length,2);
 assert.doesNotMatch(html,/<dialog\b|showModal\(/i);
});
test('the original proxy demo model remains present and STOP remains available',()=>{
 const source=scripts.find(part=>part[0].includes('id="proxy-demo-model"'))?.[1];
 assert.ok(source);
 const sandbox={};runInNewContext(source,sandbox);
 const proxy=sandbox.AIVipProxyPreview;
 const s=proxy.initial('member');
 assert.equal(proxy.canStop(s),true);
 const stopping=proxy.reduce(s,{type:'stop'});
 assert.equal(stopping.desired,false);
 assert.equal(proxy.reduce(stopping,{type:'started',revision:s.revision}).operation,'stopping');
});
