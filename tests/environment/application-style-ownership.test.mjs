import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertLayoutOnly,compileSharedToolCss,SHARED_DESIGN_MARKER} from '../../scripts/preview/shared-tool-design.mjs';
const shared=css=>SHARED_DESIGN_MARKER+'\n'+css;

test('applications can own native scoped themes and component variants',async()=>{
 const css=shared('@scope (.sample-app){:scope{--od-brand:#123456;--sample-avatar:#abcdef}.sample-button{background:var(--od-brand);padding:6px} @media(prefers-color-scheme:dark){:scope{--od-brand:#fedcba}}}');
 const compiled=await compileSharedToolCss(css);
 assert.ok(compiled.includes('@scope (.sample-app)'));
 assert.ok(compiled.endsWith(assertLayoutOnly(css)));
});
test('application customization cannot escape the native CSS scope',async()=>{
 for(const css of [
  '@scope (body){button{color:red}}',
  '@scope (:root){button{color:red}}',
  '@scope (.od-button){button{color:red}}',
  '@scope (.app, body){button{color:red}}',
  '@scope (.app){button{color:red}} button{color:red}',
  '@scope (.app){@import "https://example.invalid/style.css";}',
  '@scope (.app){button{background:url(https://example.invalid/pixel)}}',
  '@scope (.app){button{background:u\\72l("data:image/png,x")}}',
  '@scope (.app){button{background:image-set("https://example.invalid/pixel.png" 1x)}}',
  '@scope (.app){button{background:-webkit-image-set("https://example.invalid/pixel.png" 1x)}}',
  '@scope (.app){@property --od-brand{syntax:"<color>";inherits:true;initial-value:red}}',
  '@scope (.app){@font-face{font-family:x;src:url(data:x)}}',
  '@scope (.app){@keyframes global-name{from{opacity:0}to{opacity:1}}}',
  '@scope (.app){@layer global-order;}',
  '@scope (.app){button{color:red}',
  '@scope (.app){button{content:"unterminated}}',
  ...['\n','\r','\f','\r\n'].map(newline=>'@scope (.app){.x{content:"'+newline+'}}button{color:red}/*"*/}}')
 ])await assert.rejects(compileSharedToolCss(shared(css)),/E_PREVIEW_DESIGN/,css);
});
test('scope extraction respects comments and strings containing braces',async()=>{
 const css=shared('/* 🧩 */ @scope (.sample-app){/* } */ .sample-button::after{content:"🧩 } {";color:#123456}}');
 assert.doesNotThrow(()=>assertLayoutOnly(css));
 await assert.rejects(compileSharedToolCss(css+'\nbutton{color:red}'),/E_PREVIEW_DESIGN/);
 for(const newline of ['\n','\r','\f','\r\n'])
  assert.doesNotThrow(()=>assertLayoutOnly(shared('@scope (.sample-app){.sample-button::after{content:"a\\'+newline+'b"}}')));
});
test('business names and single-app variants do not enter shared sources or unrelated packages',async()=>{
 const [tokens,components,cookie]=await Promise.all(['src/ui/design-tokens.css','src/ui/design-system.css','examples/sidebar-tools/cookie-editor/src/react.css'].map(p=>readFile(p,'utf8')));
 for(const css of [tokens,components])assert.doesNotMatch(css,/od-cookie|od-theme-cookie-editor|cookie-button--|workbench-nav|sidebar-tool-remove/);
 assert.match(cookie,/@scope \(.cookie-editor-react\)/);
 assert.match(cookie,/light-dark\(/);
 const compiled=await compileSharedToolCss(cookie);
 assert.match(compiled,/--od-cookie-ink:/);
 const notes=await compileSharedToolCss(await readFile('examples/sidebar-tools/quick-notes/src/style.css','utf8'));
 assert.doesNotMatch(notes,/od-cookie|cookie-button--|od-theme-cookie-editor/);
});
test('forced preview themes map navigation color at its component owner',async()=>{
 const builder=await readFile('scripts/preview/build-workflow-react-preview.mjs','utf8');
 assert.ok(builder.includes('.od-workflow-preview-stage[data-preview-theme] .workbench-nav{--od-nav-active:var(--od-accent-ink)}'));
});
