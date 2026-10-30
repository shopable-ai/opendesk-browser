import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=new URL('../../projects/video-pass/',import.meta.url);
const read=path=>readFile(new URL(path,base),'utf8');

test('VideoPass declares only safe current-page and local-storage permissions',async()=>{
 const config=JSON.parse(await read('tool.config.json'));
 assert.equal(config.id,'video-pass');
 assert.deepEqual(config.capabilities,['currentPage.read','storage.local']);
 assert.deepEqual(config.files,{html:'src/index.html',css:'src/style.css',js:'src/main.js'});
});
test('production UI and local preview share one executable source and markup',async()=>{
 const [html,js,preview]=await Promise.all([read('src/index.html'),read('src/main.js'),read('preview/index.html')]);
 assert.ok(html.includes('id="vp-member-form"'));
 assert.ok(html.includes('id="vp-watch"')&&html.includes('id="vp-member"'));
 assert.ok(preview.includes(html));
 assert.ok(preview.includes('src="../src/main.js"'));
 assert.ok(js.includes("request('currentPage.info')"));
 assert.ok(js.includes("request('storage.set'"));
 assert.doesNotThrow(()=>new Function(js));
});
test('no external parser, media hijack, or credential collection',async()=>{
 const [js,html]=await Promise.all([read('src/main.js'),read('src/index.html')]);
 assert.doesNotMatch(js,/GM_xmlhttpRequest|unsafeWindow|executeScript|HTMLMediaElement|document\.cookie|access_token/);
 assert.doesNotMatch(html,/\s(?:type=["']password|src=["']https?:|onsubmit=)/);
 assert.ok(js.includes('ifMatch:etag'));
 assert.ok(js.includes('SHARE_KEYS'));
});
test('backup and commerce are explicitly disabled until licensed service exists',async()=>{
 const html=await read('src/index.html');
 assert.match(html,/授权备用播放服务/);
 assert.match(html,/未接入/);
 assert.match(html,/合作入口 · 未开放/);
});
