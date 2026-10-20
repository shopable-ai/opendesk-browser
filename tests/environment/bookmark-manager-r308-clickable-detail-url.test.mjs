import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const appFile='examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
const cssFile='examples/sidebar-tools/bookmark-manager/src/react/style.css';

test('R3.0.8 bookmark URL is the direct accessible link, with no duplicated footer open control',async()=>{
 const app=await readFile(appFile,'utf8');
 assert.match(app,/function safeBookmarkHref\(value\)/);
 assert.match(app,/const clickableHref=node&&!isFolder\(node\)\?safeBookmarkHref\(node\.url\):null/);
 assert.match(app,/<a className="bm-detail-url" href=\{clickableHref\} target="_blank" rel="noopener noreferrer"/);
 assert.match(app,/aria-label=\{'打开网址：'\+node\.url\}/);
 assert.match(app,/<span>\{node\.url\}<\/span><Icon name="external"/);
 assert.match(app,/bm-detail-url--disabled/);
 assert.match(app,/<OpenDeskIconButton className="bm-preview-action" label="复制网址"/);
 assert.match(app,/<OpenDeskIconButton className="bm-preview-action" label="编辑"/);
 const shared=await readFile('src/ui/react/components/ui/button.tsx','utf8');
 assert.match(shared,/aria-label=\{label\}/);
 assert.doesNotMatch(app,/className="bm-preview-action" aria-label="打开书签"/);
 // Non-React official sandbox remains installed until separately approved.
 assert.match(app,/export default function App\(\{runtime=null,mode='preview'/);
});

test('R3.0.8 direct link allows safe HTTP(S) only, including old imported bookmark URLs',async()=>{
 const app=await readFile(appFile,'utf8');
 const helper=app.match(/function safeBookmarkHref\(value\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(helper,'same UI source must define URL normalization');
 const safe=runInNewContext('('+helper+')',{URL});
 assert.equal(safe('https://example.com/a'), 'https://example.com/a');
 assert.equal(safe('http://example.com/'), 'http://example.com/');
 for(const url of [
   'javascript:alert(1)','data:text/html,<h1>unsafe</h1>','file:///etc/passwd',
   'chrome://settings/','about:blank','ftp://example.com/',
   'https://user:password@example.com/','//example.com','not-a-url'
 ]){
  assert.equal(safe(url),null,url);
 }
 assert.equal(safe(null),null);
});

test('R3.0.8 full URL remains a keyboard-focusable, wrapped hit target inside floating details',async()=>{
 const css=await readFile(cssFile,'utf8');
 assert.match(css,/\.bm-detail-url\{display:inline-flex/);
 assert.match(css,/\.bm-detail-url>span\{min-width:0;overflow-wrap:anywhere/);
 assert.match(css,/\.bm-detail-url:hover>span\{text-decoration:underline/);
 assert.match(css,/\.bm-detail-url--disabled\{color:/);
 assert.match(css,/\.bm-preview-pane\{position:absolute;z-index:12;left:12px;right:12px;bottom:12px/);
 assert.match(css,/@media\(min-width:740px\)\{/);
});
