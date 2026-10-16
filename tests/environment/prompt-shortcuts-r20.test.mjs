// R2 independent site rule semantics: Node fixtures, NOT live website acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {allowedPromptSite} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';

const root='examples/sidebar-tools/prompt-shortcuts';
async function model(){
  const code=await readFile(root+'/trusted/model.js','utf8');
  const scope={URL,Intl,TextEncoder,crypto:webcrypto};
  runInNewContext(code,scope);
  return scope.OpenDeskPromptShortcutsModel;
}
const rule={origin:'https://example.org',pathScope:'/chat',
  containerSelector:'main',editorSelector:'[role="textbox"]',
  enabled:true};
test('R2 two selector rule is exact origin + path-prefix safe and disabled by default',async()=>{
  const m=await model();
  assert.deepEqual(Array.from(m.sitesLoad(null).rules),[]);
  const sites=m.sitesLoad({schema:1,rules:[rule]});
  assert.equal(m.siteFor(sites,'https://example.org/chat/123').editorSelector,'[role="textbox"]');
  assert.equal(m.siteFor(sites,'https://example.org/chatty'),null);
  assert.equal(m.siteFor(sites,'http://example.org/chat'),null);
  assert.equal(m.siteFor(sites,'https://example.org.evil.invalid/chat'),null);
  assert.equal(m.siteFor({schema:1,rules:[{...rule,enabled:false}]},'https://example.org/chat'),null);
  assert.throws(()=>m.sitesLoad({schema:1,rules:[rule,rule]}),/重复规则/);
  assert.throws(()=>m.siteRule({...rule,origin:'https://user:pass@example.org'}));
  assert.throws(()=>m.siteRule({...rule,pathScope:'//other'}));
});
test('R2 CSS rule grammar rejects executable, compound or positional expressions',async()=>{
  const m=await model();
  for(const selector of ['#composer','main','[data-testid="composer"]',
    '[aria-label="输入消息"]','main textarea'])assert.equal(m.validSelector(selector),true,selector);
  for(const selector of ['div:nth-child(2)','body > main','textarea, input',
    'textarea:focus','[x="a"];alert(1)','', 'main {color:red}'])
    assert.equal(m.validSelector(selector),false,selector);
  assert.throws(()=>m.siteRule({...rule,editorSelector:'textarea, input'}),/选择器/);
  assert.throws(()=>m.sitesLoad({schema:1,rules:Array(25).fill(rule)}));
});
test('R2 built-in ChatGPT stays authorized; custom sites need enabled explicit rules',async()=>{
  const pkg=await createSidebarToolPackage(root),sites={schema:1,rules:[rule]};
  const base={installed:[pkg],enabled:{},url:'https://example.org/chat/new',sites};
  assert.equal(await allowedPromptSite(base),true);
  assert.equal(await allowedPromptSite({...base,sites:null}),false);
  assert.equal(await allowedPromptSite({...base,enabled:{'prompt-shortcuts':false}}),false);
  assert.equal(await allowedPromptSite({...base,installed:[]}),false);
  assert.equal(await allowedPromptSite({...base,url:'https://chatgpt.com/c/abc',sites:null}),true);
});
