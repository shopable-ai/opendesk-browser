import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createScriptEditor} from '../../src/ui/script-editor.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

const root=new URL('../../src/ui/',import.meta.url);
const [html,css,components]=await Promise.all([
  renderSidebarFixture({activeTab:'develop'}),
  readFile(new URL('tool-shell.css',root),'utf8'),
  readFile(new URL('design-system.css',root),'utf8'),
]);

test('Develop history retains unique DOM IDs, labels and nested disclosure structure',()=>{
  const $=load(html);
  const ids=['workbench-develop','developer-results-panel','script-history-panel',
    'script-read','script-history-run','script-history-open','script-history',
    'script-run-id','script-read-run','script-download-result','script-download','script-download-status'];
  for(const id of ids)assert.equal($('#'+id).length,1,'missing/duplicate '+id);
  const history=$('#developer-results-panel #script-history-panel');
  assert.equal(history.length,1,'history remains inside results');
  assert.equal(history.children('summary').text().trim(),'运行记录与技术信息');
  for(const classname of ['developer-history-content','developer-history-field',
    'developer-history-actions','developer-history-disclosure'])
    assert.ok(history.find('.'+classname).length,'missing group '+classname);
  assert.equal(history.find('#script-history-open').prop('disabled'),true);
  assert.equal(history.find('#script-history-run').attr('aria-describedby'),'script-history-hint');
  for(const control of ['script-history-run','script-run-id','script-download-result'])
    assert.equal(history.find('label[for="'+control+'"]').length,1,'accessible label '+control);
  assert.equal(history.find('details.developer-history-disclosure').length,2);
  assert.equal($('#script-status').attr('data-opendesk-react-owner'),'developer-run-status');
  assert.equal($('#script-result').attr('data-opendesk-react-owner'),'developer-result');
});

test('React history actions publish button state and query the existing Controller RunHost',async t=>{
  // Local service fakes only: the production editor, field store and React
  // controls are real. This supplies no Chrome gesture or Native E2E evidence.
  const {DeveloperPage}=await loadSidebarReact();
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>
    [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window,document,IS_REACT_ACT_ENVIRONMENT:true}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const view=createDeveloperView(),requests=[],effects=[],serviceRequests=[];
  let runs=[{runId:'history-a',state:'completed',retirementState:'released',
    revision:{scriptId:'history-script',revision:1,sourceHash:'a'.repeat(64)}}];
  let denied=[];
  const host={currentRun:null,start:async()=>{effects.push('run');throw new Error('history must not run');},subscribe:()=>()=>{},dispose(){},controller:{
    listControllerScripts:async()=>[],
    snapshotControllerRun:async request=>{
      requests.push(request);
      return {slotAvailable:true,runs,run:runs.find(row=>row.runId===request.runId),
        results:runs.map(row=>({...row,resultId:'result-'+row.runId,
          outcome:{ok:true,valueWire:encodeValue('history-secret')}})),
        downloads:[],resultDeliveryDenied:denied};
    }
  }};
  const client={ready:Promise.resolve(),request:async method=>{
    serviceRequests.push(method);return {programs:[],catalog:[]};
  }};
  const event={addListener(){},removeListener(){}};
  const editor=createScriptEditor({view,document,client,hostFactory:()=>host,
    api:{runtime:{getURL:path=>'chrome-extension://fixture/'+path},
      tabs:{onRemoved:event},permissions:{contains:async()=>false,
        request:async()=>{effects.push('permission');return false;}}}});
  const mounted=createRoot(document.getElementById('root'));
  t.after(async()=>{
    try{await React.act(async()=>{editor.dispose();mounted.unmount();view.dispose();await tick();});}
    finally{for(const [key,value] of previous){
      if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
    }}
  });
  await React.act(async()=>{mounted.render(React.createElement(DeveloperPage,{view}));await tick();});
  const get=id=>document.getElementById(id);
  const fire=async(id,type='click')=>React.act(async()=>{
    get(id).dispatchEvent(new window.Event(type,{bubbles:true}));await tick();
  });
  assert.equal(get('script-history-open').disabled,true);
  assert.equal(get('script-history-run').querySelectorAll('option').length,2,get('script-status').textContent);
  // LinkeDOM selects have no writable value; setting the real option drives
  // React's native change handler rather than calling a fabricated DOM facade.
  get('script-history-run').querySelector('[value="history-a"]').selected=true;
  await fire('script-history-run','change');
  assert.equal(view.getSnapshot().fields['script-history-run'].value,'history-a');
  assert.equal(get('script-history-open').disabled,false,'patchDeveloperField reaches React');
  await fire('script-history-open');
  assert.deepEqual(requests.at(-1),{runId:'history-a'});
  assert.match(get('script-result').textContent,/history-secret/);
  assert.equal(get('developer-results-panel').hasAttribute('open'),false,'reading history does not run or reveal a draft');
  denied=['history-a'];
  await fire('script-read');
  assert.deepEqual(requests.at(-1),{});
  assert.doesNotMatch(get('script-result').textContent,/history-secret/);
  assert.doesNotMatch(get('script-history').textContent,/history-secret/);
  assert.equal(get('script-download-result').querySelectorAll('option').length,1);
  assert.equal(get('script-copy-result').disabled,true);
  runs=[];
  await fire('script-read');
  assert.equal(view.getSnapshot().fields['script-history-run'].value,'');
  assert.equal(get('script-history-open').disabled,true,'refresh clears a removed selection');
  get('script-run-id').value='history-b';
  await fire('script-run-id','input');
  await fire('script-read-run');
  assert.deepEqual(requests.at(-1),{runId:'history-b'});
  assert.ok(requests.every(row=>Object.keys(row).every(key=>key==='runId')));
  assert.deepEqual(effects,[],'history actions cannot run code or request permissions');
  assert.ok(serviceRequests.every(method=>['listPagePrograms','listTaskCatalog','inspectPageDependencies'].includes(method)),
    'only read-only catalogs and dependency inspection are allowed');
});

test('Develop styles follow R27 tokens and reflow actions below 380 CSS px',()=>{
  assert(css.includes('#workbench-develop .developer-context>.developer-target{margin:0;padding:0}'),
    'Developer view owns target alignment, not shared disclosure appearance');
  assert(components.includes('.od-disclosure>summary{display:flex;align-items:center'),
    'All disclosure headings must share the public centered typography');
  assert(css.includes('#workbench-develop .developer-history-field{display:grid;gap:var(--space-2)'),
    'Form labels and controls need the tokenized 8px gap');
  assert(css.includes('#workbench-develop .developer-history-content{display:grid;gap:var(--space-3)'),
    'History groups need the tokenized 12px gap');
  assert(css.includes('grid-template-columns:minmax(0,1fr) auto'),
    'Wide history select and action must fit without fixed input widths');
  assert(css.includes('@media(max-width:380px)'),
    'Narrow Sidebar needs stacked history actions');
  assert(css.includes('#workbench-develop .developer-editor{display:grid;gap:var(--space-4)'),
    'Independent developer sections need 16px spacing');
  assert(html.includes('class="developer-run-area od-stack"'),
    'Output status and result must stay in one 8px group');
  assert(components.includes('.od-disclosure{min-width:0;'),
    'Shared accordion must not overflow a narrow parent');
  assert(components.includes('.od-disclosure>summary>*{min-width:0}'),
    'Summary children must shrink before overflowing');
  assert(components.includes('max-width:calc(100% - var(--space-3) - var(--space-3))'),
    '100%-width fields must fit inside both disclosure body margins');
  assert(css.includes('#workbench-develop .developer-history-disclosure>pre{max-height:240px;overflow:auto'),
    'Large JSON histories must scroll locally');
});

test('First-use connection guide uses canonical disclosure and readable action styles',()=>{
  const $=load(html);
  const guide=$('#workbench-develop #local-project-guide');
  assert.equal(guide.length,1,'local-project guide stays in Dev local mode');
  const guideMarkup=$.html(guide);
  assert(guideMarkup.includes('class="local-project-guide od-disclosure od-disclosure--info"'),
    'Guide must use the shared disclosure and opt-in information heading');
  assert(guideMarkup.includes('<summary>首次使用：连接方法</summary>'));
  assert.equal(guide.find('#local-project-guide-open').attr('type'),'button');
  assert(guideMarkup.includes('class="od-button od-button--secondary"'),
    'Guide action must use the same public button as other secondary actions');
  assert.equal(guide.find('ol > li').length,4,'connection, directory authorization, Run and Sidebar debug guidance');
  assert.match(guide.text(),/在侧栏调试/);
  assert.match(guide.text(),/此入口不会运行 npm 或安装工具/);
  assert.match(guide.text(),/网站权限仍在运行时独立确认/);
  const rule=(source,selector)=>{
    const at=source.indexOf(selector+'{');
    assert(at>=0,'missing CSS rule '+selector);
    return source.slice(at+selector.length+1,source.indexOf('}',at));
  };
  const surface=rule(components,'.od-disclosure');
  assert.match(surface,/border:1px solid var\(--od-line\)/,'keep the visible card outline');
  assert.match(surface,/border-radius:var\(--radius-surface\)/,'use canonical card radius');
  assert.match(surface,/color:var\(--od-ink\)/,'body text follows readable ink');
  const summary=rule(components,'.od-disclosure>summary');
  assert.match(summary,/font-size:var\(--od-body-size\)/,'guide heading uses shared 13px body token');
  assert.match(summary,/font-weight:650/,'heading uses shared emphasis');
  assert.match(rule(components,'.od-disclosure--info>summary'),/color:var\(--od-brand\)/,
    'blue emphasis is reserved for the guide heading');
  assert.match(rule(components,'.od-button'),/min-height:36px/,'CTA remains usable');
  assert.match(rule(components,'.od-button--secondary'),/color:var\(--od-action-ink\)/,
    'secondary action ink must stay readable');
  assert.match(rule(css,'#local-project-guide>ol'),/padding-inline-start:calc\(var\(--space-4\)/,
    'guide list retains consistent indentation');
  assert.doesNotMatch(css,/#workbench-develop #local-project-guide>summary\{/,
    'Business stylesheet must not redefine the shared disclosure heading');
});
