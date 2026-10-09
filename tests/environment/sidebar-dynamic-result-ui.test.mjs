import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(path,'utf8');
test('Sidebar separates dynamic result from technical/history details and offers explicit copy', async()=>{
  const [html,editor,task,css]=await Promise.all([
    get('src/ui/tool.html'),get('src/ui/script-editor.js'),
    get('src/ui/task-workbench.js'),get('src/ui/tool-shell.css')]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['script-result-kind','script-copy-result','script-history-panel','task-result-reveal',
    'page-preview-technical-panel','page-preview-technical'])assert(ids.includes(id),id);
  assert.match(html,/<summary>运行结果<\/summary>/);
  assert.match(html,/<summary>运行记录与技术信息<\/summary>/);
  assert.match(editor,/formatControllerRunResult\(values, focused\?\.runId/);
  assert.match(editor,/clipboard\.writeText\(output\.textContent\)/);
  assert.match(editor,/result\.resultText \?\? 'undefined'/);
  assert.doesNotMatch(editor,/result\.resultText\+' \\n源码 SHA-256/);
  assert.match(task,/presentTaskValue\(decoded\)/);
  assert.match(task,/task-result-reveal/);
  assert.match(css,/\.result-toolbar/);
});
