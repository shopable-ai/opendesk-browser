import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

const read=path=>readFile(path,'utf8');
// Compile only the test entry in memory; no product build, listener or watcher.
const require=createRequire(import.meta.url);
const compiled=await build({stdin:{contents:"export {MyTasksPage} from './src/ui/react/tabs/my-page.tsx'; export {SchedulePlanRows} from './src/ui/react/tabs/schedule.tsx';",resolveDir:process.cwd()},
  bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
  plugins:[{name:'test-react-instance',setup(builder){
    builder.onResolve({filter:/^react(?:$|\/)/},({path})=>({path:pathToFileURL(require.resolve(path)).href,external:true}));
  }}]});
const {MyTasksPage,SchedulePlanRows}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const plan={scheduleId:'plan-1',title:'<img src=x onerror=alert(1)>',triggerKind:'daily',
  triggerSpec:{hour:9,minute:5},timezone:'Asia/Shanghai',paused:false,
  nextDueAt:Date.now()+3600000,history:[{fireId:'fire-1',runId:'run-1',status:'RUNNING',scheduledAt:Date.now()}]};

test('R34.1 MyTasksPage owns schedule rows projected through myView',async()=>{
  const view=createMyWorkbenchView();
  view.field('scheduled-panel').hidden=false;
  view.project('planRows',{plans:[plan],currentRunId:'run-1'});
  view.project('managerRows',{rows:[{taskId:'task-1',title:plan.title,enabled:true,
    version:'1.0.0',siteOrigins:['https://example.com'],linked:1}]});
  const render=()=>parseHTML(renderToStaticMarkup(React.createElement(MyTasksPage,{view}))).document;
  const page=render(),owner=page.getElementById('workbench-tasks');
  for(const id of ['scheduled-panel','schedule-plan-list','schedule-manager-list']){
    assert.equal(page.querySelectorAll('#'+id).length,1,id+' has one React owner');
    assert.ok(owner.contains(page.getElementById(id)));
  }
  const card=page.querySelector('#schedule-plan-list .schedule-card');
  assert.equal(card.dataset.scheduleId,plan.scheduleId);
  assert.equal(card.querySelector('.schedule-plan-open').textContent,plan.title);
  assert.equal(card.querySelector('.schedule-state').getAttribute('role'),'img');
  assert.match(card.querySelector('.schedule-state').getAttribute('aria-label'),/运行中/);
  assert.match(card.querySelector('.schedule-plan-frequency').textContent,/每天 09:05/);
  assert.equal(card.querySelector('[data-schedule-action="stop"]').disabled,false);
  assert.equal(page.querySelector('.schedule-manager-title-line strong').textContent,plan.title);
  assert.equal(page.querySelector('img'),null,'projected titles are escaped by React');
  view.project('planRows',{plans:[plan],currentRunId:'another-run'});
  assert.equal(render().querySelector('[data-schedule-action="stop"]').disabled,true,
    'only the owning RunHost may stop a Fire');

  const [source,scheduler,shell]=await Promise.all([
    read('src/ui/react/tabs/my-page.tsx'),read('src/ui/scheduled-task-workbench.js'),
    read('src/ui/tool-shell.js')
  ]);
  assert.ok(source.includes('<SchedulePlanRows {...(view.data.planRows||{})}'));
  assert.ok(source.includes('<ScheduleManagerRows {...(view.data.managerRows||{})}'));
  assert.ok(scheduler.includes("myView.project('planRows',{plans,currentRunId:host.currentRun||''"));
  assert.ok(scheduler.includes("myView.project('managerRows'"));
  assert.ok(scheduler.includes('onOpen:myView.action(openDetail)'));
  assert.ok(scheduler.includes('onStop:(plan,fire)=>void stopCardRun(plan,fire)'));
  assert.ok(shell.includes('myView'));
});

test('R34.1 schedule card actions reject untrusted events and forward fixed plan/Fire identity',()=>{
  const calls=[];
  const rows=SchedulePlanRows({plans:[plan],currentRunId:'run-1',
    onOpen:id=>calls.push(['open',id]),onToggle:value=>calls.push(['toggle',value]),
    onEdit:value=>calls.push(['edit',value]),onStop:(value,fire)=>calls.push(['stop',value,fire])});
  const elements=[];
  const visit=node=>{
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!React.isValidElement(node))return;
    elements.push(node);visit(node.props.children);
  };
  visit(rows);
  const actions=[elements.find(node=>node.props.className?.includes('schedule-plan-open')),
    ...['toggle','edit','stop'].map(action=>elements.find(node=>node.props['data-schedule-action']===action))];
  for(const action of actions){
    assert.equal(typeof action?.props.onClick,'function');
    action.props.onClick({nativeEvent:{isTrusted:false}});
    action.props.onClick({nativeEvent:{}});
  }
  assert.deepEqual(calls,[]);
  actions.forEach(action=>action.props.onClick({nativeEvent:{isTrusted:true}}));
  assert.deepEqual(calls,[['open',plan.scheduleId],['toggle',plan],['edit',plan],['stop',plan,plan.history[0]]]);
  const article=elements.find(node=>node.type==='article');
  article.props.onClick({nativeEvent:{isTrusted:true},target:{closest:()=>({})}});
  assert.equal(calls.length,4,'clicking an interactive child must not also open its card');
});

test('R34.1 preview shares schedule components while authority stays outside presentation',async()=>{
  const [ui,preview,builder,officialHtml]=await Promise.all([
    read('src/ui/react/tabs/schedule.tsx'),read('src/ui/react/preview/sidebar-six-my-flows.tsx'),
    read('scripts/preview/build-sidebar-six-react-preview.mjs'),renderSidebarFixture()
  ]);
  assert.doesNotMatch(ui,/chrome\.|client\.request\(|host\.stop\(|createRoot\(/);
  assert.match(preview,/createPortal\(<SchedulePlanRows/);
  assert.match(preview,/createPortal\(<ScheduleManagerRows/);
  assert.doesNotMatch(preview,/return <article key=\{p\.id\} className="schedule-card/);
  assert.match(builder,/src\/ui\/react\/tabs\/schedule\.tsx/);
  assert.doesNotMatch(officialHtml,/<path\s+[^>]*\/\s*>/,
    'sidepanel.html keeps non-self-closing HTML-compatible SVG paths for WXT');
});
