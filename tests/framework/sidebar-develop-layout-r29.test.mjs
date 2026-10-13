import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../../src/ui/',import.meta.url);
const [html,css,editor]=await Promise.all([
  readFile(new URL('tool.html',root),'utf8'),
  readFile(new URL('tool-shell.css',root),'utf8'),
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
  for(const classname of ['developer-history-content','developer-history-field',
      'developer-history-actions','developer-history-disclosure'])
    assert(markup.includes('class="'+classname+'"'),'missing group '+classname);
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
  assert(css.includes('#workbench-develop .developer-editor>details{'),
    'Independent accordion surfaces must be scoped');
  assert(css.includes('#workbench-develop .developer-history-field{display:grid;gap:var(--space-2)'),
    'Form labels and controls need the tokenized 8px gap');
  assert(css.includes('#workbench-develop .developer-history-content{display:grid;gap:var(--space-3)'),
    'History groups need the tokenized 12px gap');
  assert(css.includes('grid-template-columns:minmax(0,1fr) auto'),
    'Wide history select and action must fit without fixed input widths');
  assert(css.includes('@media(max-width:380px)'),
    'Narrow Sidebar needs stacked history actions');
  assert(css.includes('max-width:calc(100% - var(--space-3) * 2)'),
    'Content must not escape its own card padding');
  assert(css.includes('#workbench-develop .developer-history-disclosure>pre{max-height:240px;overflow:auto'),
    'Large JSON histories must scroll locally');
});
