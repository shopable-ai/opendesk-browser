import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {verifyTaskPackage,validateTaskParams} from '../../src/platform/tasks/contract.js';

const candidatePath='examples/tasks/agent-modern-search.v1.opendesk-task.json';
const draftPath='examples/tasks/modern-search-draft.js';
const observePath='examples/tasks/agent-observe-draft.js';
const readCandidate=async()=>JSON.parse(await readFile(candidatePath,'utf8'));

test('AI-to-Task sample is a valid immutable Task v1 Candidate with exact checked-in source',async()=>{
  const raw=await readCandidate(),pkg=await verifyTaskPackage(raw);
  assert.equal(pkg.manifest.taskId,'sample.agent-modern-search');
  assert.equal(pkg.manifest.version,'1.0.0');
  assert.deepEqual(pkg.manifest.siteOrigins,['http://127.0.0.1:43111']);
  assert.deepEqual(pkg.manifest.permissions,['page.automation']);
  assert.equal(pkg.manifest.entryFormat,'async-main');
  assert.equal(pkg.sourceUtf8,await readFile(draftPath,'utf8'),'package bytes must equal modern-search-draft.js');
  assert.deepEqual(validateTaskParams(pkg.manifest.paramsSchema,{}),{keyword:'OpenDesk'});
  assert.equal(Object.hasOwn(raw,'stage'),false);
  assert.equal(Object.hasOwn(raw,'verification'),false);
  assert.doesNotThrow(()=>new Script(pkg.sourceUtf8));
});
test('tampering cannot grant publication state or replace the source hash',async()=>{
  const pkg=await readCandidate();
  await assert.rejects(verifyTaskPackage({...pkg,stage:'available'}),{code:'E_SCHEMA'});
  await assert.rejects(verifyTaskPackage({...pkg,sourceUtf8:pkg.sourceUtf8+'// tampered'}),{code:'E_HASH'});
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,siteOrigins:['https://example.com']}}),{code:'E_HASH'});
});
test('modern candidate only uses implemented Locator actions with an explicit business-result wait',async()=>{
  const source=(await readCandidate()).sourceUtf8;
  assert.match(source,/page\.getByLabel\('搜索关键词',[\s\S]*?\.fill\(/);
  assert.match(source,/page\.getByRole\('button',[\s\S]*?\.click\(/);
  assert.match(source,/page\.getByText\('搜索完成',[\s\S]*?\.waitFor\(/);
  assert.match(source,/page\.locator\('#results'\)\.textContent\(\)/);
  assert.doesNotMatch(source,/chrome\.|chromium\.launch|permissions\.request|eval\(/);
});
test('observation draft is bounded, read-only and valid Controller async main',async()=>{
  const source=await readFile(observePath,'utf8');
  assert.doesNotThrow(()=>new Script(source));
  assert.match(source,/async function main\(\)/);
  assert.match(source,/await page\.observe\(/);
  assert.match(source,/root:'#search-form'/);
  for(const bound of ['maxDepth:5','maxNodes:32','maxChars:4200']) assert(source.includes(bound));
  assert.doesNotMatch(source,/\.(?:fill|click|goto|reload|type|evaluate)\s*\(/);
});
test('AI-to-Task samples target the original HTML fixture rather than inventing a second page',async()=>{
  const html=await readFile('examples/tasks/demo-form.html','utf8');
  for(const token of ['id="search-form"','id="keyword"','id="search-submit"','id="search-status"','id="results"','id="search-count"'])
    assert(html.includes(token),'missing demo selector: '+token);
  assert.match(html,/<label for="keyword">搜索关键词<\/label>/);
  assert.match(html,/searchStatus\.textContent = '搜索完成'/);
});
