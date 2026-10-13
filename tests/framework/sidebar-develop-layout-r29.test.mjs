import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../../src/ui/',import.meta.url);
const [html,css,components,editor]=await Promise.all([
  readFile(new URL('tool.html',root),'utf8'),
  readFile(new URL('tool-shell.css',root),'utf8'),
  readFile(new URL('design-system.css',root),'utf8'),
  readFile(new URL('script-editor.js',root),'utf8'),
]);

test('Develop history retains unique DOM IDs, labels and nested disclosure structure',()=>{
  const ids=['workbench-develop','developer-results-panel','script-history-panel',
    'script-read','script-history-run','script-history-open','script-history',
    'script-run-id','script-read-run','script-download-result','script-download','script-download-status'];
  for(const id of ids)
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'missing/duplicate '+id);
  const start=html.indexOf('<details id="script-history-panel"');
  const end=html.indexOf('\n  </div></details>\n  <details id="developer-run-technical"',start);
  assert(start>=0&&end>start,'History must remain inside results panel');
  const markup=html.slice(start,end);
  assert(markup.includes('<summary>运行记录与技术信息</summary>'));
  const classGroups=[...markup.matchAll(/class="([^"]*)"/g)].map(match=>match[1].split(/\s+/));
  for(const classname of ['developer-history-content','developer-history-field',
      'developer-history-actions','developer-history-disclosure'])
    assert(classGroups.some(classes=>classes.includes(classname)),'missing group '+classname);
  assert(markup.includes('id="script-history-open" type="button" disabled'));
  assert(markup.includes('aria-describedby="script-history-hint"'));
  for(const control of ['script-history-run','script-run-id','script-download-result'])
    assert(markup.includes('for="'+control+'"'),'missing accessible label '+control);
  assert.equal((markup.match(/<details\b/g)||[]).length,
    (markup.match(/<\/details>/g)||[]).length,'malformed nested details');
});

test('Existing history actions stay connected to the same Controller RunHost',()=>{
  for(const id of ['script-read','script-history-open','script-history-run',
    'script-read-run','script-download'])
    assert(editor.includes("'"+id+"'"),'missing history handler '+id);
  assert(editor.includes("find('script-history-open').disabled = !history.value"),
    'Refresh should disable View when no run is selected');
  assert(editor.includes("find('script-history-open').disabled=!find('script-history-run').value"),
    'Changing selection should update View action');
  assert(editor.includes("snapshotControllerRun(runId ? {runId} : {})"),
    'Run history must use the existing Controller host');
});

test('Develop styles follow R27 tokens and reflow actions below 380 CSS px',()=>{
  assert(css.includes('#workbench-develop .developer-editor>.od-disclosure{'),
    'Developer layout must scope the shared disclosure component');
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
  assert(components.includes('.od-disclosure{min-width:0;'),
    'Shared accordion must not overflow a narrow parent');
  assert(components.includes('.od-disclosure>summary>*{min-width:0}'),
    'Summary children must shrink before overflowing');
  assert(css.includes('#workbench-develop .developer-history-disclosure>pre{max-height:240px;overflow:auto'),
    'Large JSON histories must scroll locally');
});

test('First-use connection guide uses canonical disclosure and readable action styles',()=>{
  const guideStart=html.indexOf('<details id="local-project-guide"');
  const guideEnd=html.indexOf('<details id="local-project-params-tools"',guideStart);
  assert(guideStart>=0&&guideEnd>guideStart,'local-project guide stays in Dev local mode');
  const guideMarkup=html.slice(guideStart,guideEnd);
  assert(guideMarkup.includes('class="local-project-guide od-disclosure od-disclosure--info"'),
    'Guide must use the shared disclosure and opt-in information heading');
  assert(guideMarkup.includes('<summary>首次使用：连接方法</summary>'));
  assert(guideMarkup.includes('id="local-project-guide-open" type="button"'));
  assert(guideMarkup.includes('class="od-button od-button--secondary"'),
    'Guide action must use the same public button as other secondary actions');
  assert.equal((guideMarkup.match(/<li>/g)||[]).length,3,'three documented onboarding steps stay intact');
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
