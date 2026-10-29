import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const project=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const registry=readFileSync(new URL('../src/answer-registry.js',import.meta.url),'utf8');

test('new Mind Map is an independent ChatGPT-only Page Program',()=>{
  assert.equal(project.opendesk.id,'opendesk.ai-reply-mindmap');
  assert.equal(project.version,'0.2.7');
  assert.deepEqual(project.opendesk.pageRules.matches,['https://chatgpt.com/*']);
  assert.deepEqual(project.opendesk.pageRules.excludeMatches,[]);
  assert.equal(project.opendesk.pageRules.world,'USER_SCRIPT');
  assert.match(source,/const PROGRAM_ID='opendesk\.ai-reply-mindmap'/);
  assert.match(source,/id:PROGRAM_ID\+'\.lifecycle'/);
  assert.match(source,/return \{programId:PROGRAM_ID,status:'active'/);
  assert.match(source,/programRevision:\{version:'0\.2\.7',revision:1\}/);
  assert.doesNotMatch(source,/opendesk\.chatgpt-mindmap/);
});

test('legacy Viewer Theme is read-only compatibility data, not an authority alias',()=>{
  assert.match(registry,/const VIEW_THEME_KEY='opendesk\.ai-reply-mindmap\.viewer-theme\.v1'/);
  assert.match(registry,/const LEGACY_VIEW_THEME_KEY='opendesk\.chatgpt-mindmap\.viewer-theme\.v1'/);
  assert.match(registry,/program:\{id:'opendesk\.ai-reply-mindmap'/);
  assert.match(registry,/setItem\(VIEW_THEME_KEY,mode\)/);
  assert.doesNotMatch(registry,/setItem\(LEGACY_VIEW_THEME_KEY/);
});
