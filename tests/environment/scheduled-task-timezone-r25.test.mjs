import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getScheduleDeviceTimeZone,listScheduleTimeZoneGroups,filterScheduleTimeZoneGroups} from '../../src/ui/scheduled-task-workbench.js';
import {nextScheduleAt,parseWallScheduleTime,formatWallScheduleTime} from '../../src/platform/tasks/schedule-time.js';

const flatten=groups=>groups.flatMap(g=>g.options);
test('R2.5 timezone choices detect the browser zone but persist a concrete IANA value',()=>{
  const actual=getScheduleDeviceTimeZone();
  assert.ok(actual==='UTC'||actual.includes('/'));
  assert.doesNotThrow(()=>new Intl.DateTimeFormat('zh-CN',{timeZone:actual}));
  const groups=listScheduleTimeZoneGroups(Intl,actual);
  assert.equal(groups[0].label,'当前设备 · 默认');
  assert.equal(groups[0].options[0].value,actual);
  assert.match(groups[0].options[0].label,/自动识别/);
  const options=flatten(groups);
  assert.equal(new Set(options.map(o=>o.value)).size,options.length,'each IANA value must appear exactly once');
  for(const zone of ['UTC','Asia/Tokyo','Asia/Shanghai','America/New_York','Europe/London'])
    assert.ok(options.some(o=>o.value===zone),'select must contain '+zone);
  assert.ok(groups.some(g=>g.label==='常用地区'));
});
test('R2.5 form preserves an explicit saved time zone, even when device zone changes',()=>{
  const saved='Europe/London';
  const groups=listScheduleTimeZoneGroups(Intl,saved);
  assert.ok(flatten(groups).some(o=>o.value===saved));
  assert.ok(flatten(groups).some(o=>o.value===getScheduleDeviceTimeZone()));
  assert.ok(flatten(groups).every(x=>typeof x.value==='string'));
});
test('R2.5 unknown system timezone falls back to UTC; corrupt saved value is not silently rewritten',()=>{
  class UnsupportedIntlFormat{
    constructor(locale,options){
      if(options?.timeZone&&!['UTC','Asia/Tokyo'].includes(options.timeZone))throw Error('unknown zone');
    }
    resolvedOptions(){return {timeZone:'Not/A_TimeZone'}}
  }
  const mock={DateTimeFormat:UnsupportedIntlFormat,supportedValuesOf:()=>['Asia/Tokyo']};
  assert.equal(getScheduleDeviceTimeZone(mock),'UTC');
  const groups=listScheduleTimeZoneGroups(mock,'Bad/Zone');
  assert.equal(groups[0].options[0].value,'UTC');
  assert.ok(groups.some(g=>g.label.includes('请检查')&&g.options.some(o=>o.value==='Bad/Zone')));
});
test('R2.5 production form is a scoped four-part layout with native dropdown and two-stage save',async()=>{
  const [html,css,ui,preview]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),readFile('src/ui/tool-shell.css','utf8'),
    readFile('src/ui/scheduled-task-workbench.js','utf8'),
    readFile('examples/ui/scheduled-tasks-r2.5-preview.html','utf8')
  ]);
  assert.match(html,/<select id="schedule-timezone" required aria-describedby="schedule-timezone-help schedule-time-error"/);
  assert.doesNotMatch(html,/<input id="schedule-timezone"/);
  assert.match(html,/id="schedule-timezone-help"/);
  for(const id of ['schedule-source-section-title','schedule-target-section-title','schedule-advanced-section-title',
    'schedule-save-confirm','schedule-confirm-yes','schedule-confirm-no','schedule-task-select'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,/\.schedule-form-section\{display:grid;gap:var\(--space-3\)/);
  assert.match(css,/\.schedule-rule-row\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);gap:var\(--space-3\)/);
  assert.match(css,/@media\(max-width:420px\)\{/);
  assert.match(ui,/const selectedZone=getScheduleDeviceTimeZone\(\)/);
  assert.match(ui,/get\('schedule-once'\)\.value=formatWallScheduleTime\(selectedZone,Date\.now\(\)\+10\*60000\)/);
  assert.match(ui,/populateTimeZoneSelect\(selectedZone\)/);
  assert.match(ui,/populateTimeZoneSelect\(plan\.timezone\)/);
  assert.match(ui,/await client\.request\('saveSchedule',pending\.input\)/);
  assert.match(preview,/id="field-zone" data-field="zone"/);
  assert.match(preview,/timeZoneChoices\(d\.zone\)/);
});

test('R2.6 IANA search filters choices without changing the saved zone, including no matches',()=>{
  const groups=listScheduleTimeZoneGroups(Intl,'Europe/London');
  const tokyo=filterScheduleTimeZoneGroups(groups,'东京','Europe/London');
  const values=flatten(tokyo).map(option=>option.value);
  assert.ok(values.includes('Asia/Tokyo'),'Chinese label search locates Tokyo');
  assert.ok(values.includes('Europe/London'),'editing keeps the original fixed zone visible');
  assert.equal(new Set(values).size,values.length,'filter must not duplicate a time zone');
  const newYork=flatten(filterScheduleTimeZoneGroups(groups,'New_York','Europe/London'));
  assert.ok(newYork.some(option=>option.value==='America/New_York'),'IANA name remains searchable');
  const empty=flatten(filterScheduleTimeZoneGroups(groups,'not-a-real-city-92831','Europe/London'));
  assert.deepEqual(empty.map(option=>option.value),['Europe/London'],
    'an empty search result must not erase the existing selection');
  assert.equal(filterScheduleTimeZoneGroups(groups,'', 'Europe/London'),groups,
    'clearing search returns original choices without a new time algorithm');
});
test('R2.6 production IANA search and save-confirmation retain the original authority flow',async()=>{
  const [html,ui,css,preview]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),readFile('src/ui/scheduled-task-workbench.js','utf8'),
    readFile('src/ui/tool-shell.css','utf8'),readFile('examples/ui/scheduled-tasks-r2.5-preview.html','utf8')
  ]);
  assert.match(html,/id="schedule-timezone-search"[^>]+type="search"/);
  assert.match(html,/id="schedule-timezone-match"[^>]+aria-live="polite"/);
  assert.match(ui,/filterScheduleTimeZoneGroups\(all,search,selected\)/);
  assert.match(ui,/populateTimeZoneSelect\(plan\.timezone\)/);
  assert.match(ui,/时区：\$\{zone\}（保存后固定）/);
  assert.match(ui,/await client\.request\('saveSchedule',pending\.input\)/);
  assert.match(ui,/expectedGeneration:editing\.generation/);
  assert.match(css,/\.schedule-form-section\{display:grid;gap:var\(--space-3\)/);
  assert.match(preview,/id="zone-query"[^>]+type="search"|type="search" id="zone-query"/);
  assert.match(preview,/timeZoneChoices\(selected,el\.value\)/);
});

test('R2.6 DST gaps/folds and timezone crossings use only the canonical scheduler',()=>{
  const spring=parseWallScheduleTime('America/New_York','2026-03-08T02:30');
  assert.equal(new Date(spring).toISOString(),'2026-03-08T07:00:00.000Z',
    'the nonexistent spring hour advances to the first real wall-time minute');
  assert.equal(formatWallScheduleTime('America/New_York',spring),'2026-03-08T03:00');
  const fold=parseWallScheduleTime('America/New_York','2026-11-01T01:30');
  assert.equal(new Date(fold).toISOString(),'2026-11-01T05:30:00.000Z',
    'the first physical instant wins the duplicated autumn wall-time minute');
  assert.equal(nextScheduleAt('daily',{hour:9,minute:0},'Asia/Tokyo',
    Date.parse('2026-10-13T00:30:00Z')),Date.parse('2026-10-14T00:00:00Z'));
  assert.equal(nextScheduleAt('daily',{hour:9,minute:0},'Asia/Shanghai',
    Date.parse('2026-10-13T00:30:00Z')),Date.parse('2026-10-13T01:00:00Z'));
  assert.throws(()=>parseWallScheduleTime('Bad/Zone','2026-10-13T09:00'));
});
