import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const paths={
  "settings": "src/ui/react/components/trusted-settings.css",
  "time-review": "examples/sidebar-tools/time-review/trusted/host.css",
  "bookmark-manager": "examples/sidebar-tools/bookmark-manager/trusted/host.css",
  "cookie-editor": "examples/sidebar-tools/cookie-editor/trusted/host.css",
  "ai-vip-share": "examples/sidebar-tools/ai-vip-share/trusted/host.css",
  "prompt-shortcuts": "examples/sidebar-tools/prompt-shortcuts/trusted/host.css",
  "reading-toc": "examples/sidebar-tools/reading-toc/trusted/host.css"
};
// Captured before extraction: selector, media condition, declarations and their order.
// Intentionally fixed: changing a control's visual behavior requires an explicit review.
const baseline={
  "settings": {
    "count": 9,
    "sha256": "e860e62b80315e1eed87667d1a6e480fc1cd521da83ed49afeb0b19915f4b8e8"
  },
  "time-review": {
    "count": 7,
    "sha256": "d81dc87ec600647f99f93dfedee9d42cec14f0fce81e115c120eb48dd20a2e6b"
  },
  "bookmark-manager": {
    "count": 10,
    "sha256": "03f615686d4d7ba087bd06d55642ef7e66a0182f6c382c39bc137bf060db6e3c"
  },
  "cookie-editor": {
    "count": 32,
    "sha256": "d5fc4aed5fbc055aa86b92478e4d9c36e007194a998b9beb63635e8e45504891"
  },
  "ai-vip-share": {
    "count": 6,
    "sha256": "6f7831fbf5e29a16e2f9a17976a569609d2f401834f830a5de7994da6d3f2396"
  },
  "prompt-shortcuts": {
    "count": 25,
    "sha256": "536e5a862c2ff9f0719af184a4a4968e0e92b8a579a89aefdef19ed2c274753a"
  },
  "reading-toc": {
    "count": 4,
    "sha256": "91643bf6c43c17315e8637e6ba399d36dbd1d11998ef2817bbe9b0a1fb15c0d9"
  }
};
const owner=selector=>{
 if(/time-review-(?:trusted-actions|inline-clear-review)|od-trusted-settings-(?:actions|review)/.test(selector)&&!/#time-review-/.test(selector))return 'settings';
 if(/time-review-/.test(selector))return 'time-review';
 if(/sidebar-tool-bookmark-/.test(selector))return 'bookmark-manager';
 if(/trusted-cookie-|sidebar-tool-cookie-/.test(selector))return 'cookie-editor';
 if(/ai-access-|sidebar-tool-ai-proxy/.test(selector))return 'ai-vip-share';
 if(/\[data-tool="prompt-shortcuts"\]|^#sidebar-tool-prompt-|^\.sidebar-tool-prompt-native-info/.test(selector))return 'prompt-shortcuts';
 if(/\[data-tool="reading-toc"\]/.test(selector))return 'reading-toc';
 return null;
};
const shell=read('src/ui/tool-shell.css');
function records(css,id){
 const rows=[];
 postcss.parse(css).walkRules(rule=>{
  // Class renaming is semantic only; compare the original selector/declaration baseline.
  for(const selector of rule.selectors.map(s=>s.trim()
   .replace(/\.od-trusted-settings-actions\b/g,'.time-review-trusted-actions')
   .replace(/\.od-trusted-settings-review\b/g,'.time-review-inline-clear-review'))){
   if(owner(selector)!==id)continue;
   rows.push([rule.parent.type==='atrule'?'@'+rule.parent.name+' '+rule.parent.params:'',selector,
    rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value,!!n.important])]);
  }
 });
 return rows;
}
for(const [id,path] of Object.entries(paths)){
 test(id+' preserves the pre-extraction declaration and conditional order',()=>{
  const css=shell+'\n'+read(path);
  const rows=records(css,id);
  assert.equal(rows.length,baseline[id].count);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),baseline[id].sha256);
 });
}

test('generic management and authorization stay in the host',()=>{
 const root=postcss.parse(shell),selectors=[];
 root.walkRules(rule=>selectors.push(...rule.selectors));
 for(const selector of ['.sidebar-tool-management','.sidebar-tool-settings-permissions[hidden]',
  '#sidebar-tool-enable.od-tool-management-switch','.sidebar-toc-settings-binary button:disabled']){
  assert.ok(selectors.includes(selector),selector);
 }
});

test('business styles are fixed raw imports in the existing trusted React style owner',()=>{
 const main=read('src/ui/react/main.tsx');
 const injected=main.match(/<style data-opendesk-trusted-react-css="">\{([^}]+)\}<\/style>/)?.[1];
 assert.ok(injected,'existing single style owner');
 for(const [id,path] of Object.entries(paths)){
  const imported=[...main.matchAll(/import (\w+) from '([^']+\.css)\?raw';/g)]
   .find(match=>new URL(match[2],new URL('../../src/ui/react/main.tsx',import.meta.url)).pathname===
     new URL('../../'+path,import.meta.url).pathname);
  assert.ok(imported,id+' has a fixed source import');
  assert.ok(injected.includes(imported[1]),id+' is included in the style owner');
  assert.ok(injected.indexOf(imported[1])<injected.indexOf('sharedUiCSS'),
   'existing React overrides still load after extracted host CSS');
  assert.equal(records(shell,id).length,0,id+' no longer belongs to tool-shell');
  const root=postcss.parse(read(path));
  root.walkRules(rule=>{
   for(const selector of rule.selectors){
    assert.equal(owner(selector.trim()),id,'no global/reset/foreign feature selector: '+selector);
   }
  });
 }
 assert.ok(injected.indexOf('trustedSettingsCSS')<injected.indexOf('timeReviewHostCSS'),
  'Time Review-specific confirmation overrides still follow shared settings');
});

test('retired AdBlock has only hidden notice protection, no product control skin',()=>{
 const selectors=[];
 postcss.parse(shell).walkRules(rule=>{
  if(/adblock-native/.test(rule.selector))selectors.push(rule.selector);
 });
 assert.deepEqual(selectors,['#sidebar-tool-adblock-native[hidden]']);
 assert.match(shell,/#sidebar-tool-adblock-native\[hidden\]\{display:none!important\}/);
 assert.match(read('src/ui/react/tabs/tool-host.tsx'),
  /<section id="sidebar-tool-adblock-native" hidden=\{!snapshot\.legacyAdblockVisible\}>此版本 AdBlock/);
});

test('outgoing colors belong to both transcript parents, including the split Portal',()=>{
 const css=postcss.parse(read('src/ui/react/components/conversation-dock.css'));
 const definitions=[];
 css.walkRules(rule=>{
  const values={};
  rule.walkDecls(/^--od-conversation-user-/,decl=>{values[decl.prop]=decl.value;});
  if(!Object.keys(values).length)return;
  assert.deepEqual(rule.selectors,['.od-conversation-log','.workflow-chat-transcript']);
  definitions.push([rule.parent.type==='atrule'?rule.parent.params:'light',values]);
 });
 assert.deepEqual(definitions,[
  ['light',{'--od-conversation-user-bg':'#95ec69','--od-conversation-user-ink':'#20341e'}],
  ['(prefers-color-scheme:dark)',{'--od-conversation-user-bg':'#31543c','--od-conversation-user-ink':'#effaf0'}]
 ]);
 assert.match(read('src/ui/react/components/conversation.tsx'),/logClassName='od-conversation-log'/);
 assert.match(read('src/ui/react/tabs/workflow.tsx'),/className="workflow-chat-transcript"/);
 assert.match(read('src/ui/react/tabs/workflow.tsx'),/splitTargets transcriptTarget=\{transcriptTarget\}/);
 assert.doesNotMatch(read('src/ui/react/components/conversation-dock.css'),/:root/);
});

test('workbench dark overrides remain host-owned with the original declarations',()=>{
 const rules=[];
 postcss.parse(shell).walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.params==='(prefers-color-scheme:dark)'&&
   /^:root (?:\.workbench-nav|\.sidebar-tool-icon-action|#sidebar-tool-remove)/.test(rule.selector)){
   rules.push([rule.selector,rule.nodes.map(d=>[d.prop,d.value])]);
  }
 });
 assert.deepEqual(rules,[
  [':root .workbench-nav',[['background','var(--od-paper)']]],
  [':root .workbench-nav button',[['color','var(--od-sub)']]],
  [':root .workbench-nav button[aria-selected=true]',[['color','var(--od-nav-active)'],['border-bottom-color','var(--od-nav-active)']]],
  [':root .sidebar-tool-icon-action',[['color','var(--od-sub)']]],
  [':root .sidebar-tool-icon-action:hover:not(:disabled)',[['background','var(--od-muted)']]],
  [':root #sidebar-tool-remove:hover:not(:disabled)',[['background','var(--od-negative-bg)'],['color','var(--od-negative)']]]
 ]);
});

test('navigation active colors are local and workspace focus retains its original specificity',()=>{
 const root=postcss.parse(read('src/ui/tool-shell.css')),colors=[],focus=[];
 root.walkRules(rule=>{
  rule.walkDecls('--od-nav-active',decl=>{
   assert.equal(rule.selector,'.workbench-nav');
   colors.push([rule.parent.type==='atrule'?rule.parent.params:'light',decl.value]);
  });
  if(rule.selector==='#workspace-content :focus-visible'){
   focus.push(rule.nodes.map(decl=>[decl.prop,decl.value]));
  }
 });
 assert.deepEqual(colors,[['light','var(--od-brand)'],['(prefers-color-scheme:dark)','#9dc1ff']]);
 assert.deepEqual(focus,[[['outline','2px solid var(--od-focus)'],['outline-offset','2px']]]);
});

for(const [kind,settingsId,reviewId] of [
 ['timeReview','time-review-permission-settings','time-review-inline-clear-review'],
 ['stayFocus','stay-focus-trusted-settings','stay-focus-clear-confirm']
]){
 test(kind+' shares neutral settings classes while keeping review IDs and hidden state',t=>{
  const f=settingsReactFixture(kind,t);
  const model={visible:true,busy:false,canGrant:true,phase:'active',origins:[],clearReview:false};
  f.ui.render(model);
  assert.equal(f.find(settingsId).className,'od-trusted-settings-actions');
  assert.equal(f.find(reviewId).className,'od-trusted-settings-review');
  assert.equal(f.find(reviewId).hidden,true);
  f.ui.render({...model,clearReview:true});
  assert.equal(f.find(reviewId).hidden,false);
  assert.equal(f.root.querySelector('.time-review-trusted-actions,.time-review-inline-clear-review'),null);
 });
}
