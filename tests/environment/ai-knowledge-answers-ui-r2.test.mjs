import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../../examples/sidebar-tools/ai-knowledge-answers/',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
test('R2 UI: source pages are separate and there is no ever-expanded CRUD column',()=>{
 const html=read('src/index.html');
 for(const id of ['qa-view-ask','qa-view-list','qa-view-edit','qa-tab-ask','qa-tab-list',
  'qa-search','qa-editor','qa-manage','qa-review','qa-query'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="qa-view-list"[^>]*hidden/);
 assert.match(html,/id="qa-view-edit"[^>]*hidden/);
 assert.doesNotMatch(html,/<h1/);
 const all=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(all).size,all.length);
});
test('R2 UI: host storage, model, permission restrictions remain unchanged',()=>{
 const config=JSON.parse(read('tool.config.json'));
 assert.deepEqual(config.capabilities,['storage.local','user.export']);
 const js=read('src/main.js');new Function(js);
 assert.match(js,/storage\.get/);assert.match(js,/storage\.set/);
 assert.match(js,/withEtag:true/);assert.match(js,/ifMatch:etag/);
 assert.match(js,/aria-selected/);
 assert.doesNotMatch(js,/chrome\.runtime|fetch\(/);
 const css=read('src/style.css');
 assert.match(css,/@opendesk-shared-design/);
 assert.match(css,/min-width:0/);
});
test('R2 UI: preview references actual source rather than duplicating business implementation',()=>{
 const preview=read('preview/index.html');
 for(const name of ['../src/index.html','../src/style.css','../src/main.js','../src/model.js'])
   assert.ok(preview.includes(name));
 assert.match(preview,/preview-only/);
 assert.match(preview,/样本|示例|模拟|预览/);
 const data=JSON.parse(read('fixtures/sample-knowledge.json'));
 assert.equal(data.version,1);assert.ok(data.items.length>=10&&data.items.length<=20);
 assert.ok(new TextEncoder().encode(JSON.stringify(data)).byteLength<=8192);
});
