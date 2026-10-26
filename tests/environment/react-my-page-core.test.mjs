import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';
import {readFile} from 'node:fs/promises';

test('My page empty entry contains no task, schedule or dock body',async()=>{
  const {document}=parseHTML(await readFile('src/ui/sidepanel.html','utf8'));
  assert.equal(document.getElementById('opendesk-react-app').children.length,0);
  for(const id of ['task-installed-cards','scheduled-panel','schedule-form','task-dock','task-run','task-stop'])
    assert.equal(document.getElementById(id),null,id+' must only be created by React');
});

test('My page, owning dock and standalone task catalog consume the same presentation state',async t=>{
  const {MyControl,MyTasksPage,MyTasksDock,TaskCatalogPage}=await loadSidebarReact();
  const view=createMyWorkbenchView();
  view.field('task-result-panel').hidden=false;
  view.field('task-result').text='a real task result';
  view.field('task-stop').attributes['aria-label']='停止「任务 A」';
  view.field('task-stop').hidden=false;
  const result=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-result-panel'}))).document;
  assert.equal(result.getElementById('task-result-panel').hasAttribute('hidden'),false);
  view.field('task-dock').hidden=false;
  const dock=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-dock'}))).document;
  assert.equal(dock.getElementById('task-dock').hasAttribute('hidden'),false);
  const hidden=parseHTML(renderToStaticMarkup(React.createElement(MyControl,{view,id:'task-dock',hidden:true}))).document;
  assert.equal(hidden.getElementById('task-dock').hasAttribute('hidden'),true);
  const page=parseHTML(renderToStaticMarkup(React.createElement(MyTasksPage,{view}))).document;
  for(const id of ['my-task-surface','task-installed-cards','task-params-form','task-result',
    'scheduled-panel','schedule-form','schedule-title','schedule-task-select','schedule-timezone',
    'schedule-kind','schedule-once','schedule-clock','schedule-weekdays-field','schedule-minutes',
    'schedule-save','schedule-cancel','schedule-task-manager','schedule-discard-confirm'])
    assert.ok(page.getElementById(id),id+' must be owned by the React page');
  assert.equal(page.getElementById('scheduled-panel').hasAttribute('hidden'),true);
  assert.equal(page.getElementById('schedule-form').hasAttribute('hidden'),true);
  assert.ok(page.getElementById('task-run'),'Run is mounted once inside selected task details');
  assert.ok(page.getElementById('task-selected-workspace').contains(page.getElementById('task-run')));
  const scheduleOpen=page.getElementById('schedule-open');
  assert.equal(scheduleOpen.getAttribute('aria-label'),'打开定时计划');
  assert.equal(scheduleOpen.className,'od-icon-button');
  const header=page.querySelector('.task-section-head');
  assert.ok(header.classList.contains('od-page-head'),'My uses shared page header');
  assert.ok(header.querySelector('.task-section-actions').classList.contains('od-page-actions'));
  assert.deepEqual([...header.querySelectorAll('.task-section-actions button')].map(button=>button.id),
    ['my-agent-toggle','task-manage-toggle','schedule-open','task-open-catalog']);
  assert.equal(page.getElementById('task-search-toggle'),null,'standalone search no longer occupies header');
  assert.ok(page.getElementById('task-open-catalog').classList.contains('od-icon-button--primary'));
  assert.equal(page.getElementById('task-search-panel').getAttribute('role'),'search');
  assert.equal(page.getElementById('task-search-panel').hasAttribute('hidden'),true);
  assert.equal(page.getElementById('task-manage-toggle').getAttribute('aria-controls'),
    'task-search-panel task-installed-cards');
  const owningDock=parseHTML(renderToStaticMarkup(React.createElement(MyTasksDock,{view}))).document;
  assert.equal(owningDock.getElementById('task-run'),null,'footer is Stop-only');
  assert.equal(owningDock.getElementById('task-stop').getAttribute('aria-label'),'停止「任务 A」');
  assert.ok(owningDock.getElementById('task-stop').classList.contains('od-button--danger'));
  view.data.catalogRows={rows:[{key:'task@1',title:'<unsafe>',description:'description',state:'待验证'}],selectedKey:'task@1'};
  const markup=renderToStaticMarkup(React.createElement(TaskCatalogPage,{view}));
  assert.match(markup,/&lt;unsafe&gt;/);
  assert.doesNotMatch(markup,/<unsafe>/);
  const catalog=parseHTML(markup).document;
  for(const id of ['task-catalog-list','task-package-file','task-verify-run','task-verify','task-publish','task-install','task-catalog-status'])
    assert.ok(catalog.getElementById(id),id+' must have a real React consumer');
});
