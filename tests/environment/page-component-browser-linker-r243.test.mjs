import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {prepareBrowserPageComponent} from '../../src/libs/page-frameworks/page-component-browser-linker.js';
import {transformVueSFC} from '../../src/libs/page-frameworks/vue-sfc-transform.js';
const require=createRequire(new URL('../../scripts/page-browser-babel/package.json',import.meta.url));
const Babel=require('@babel/standalone');
const rules={matches:['http://127.0.0.1:43111/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
const fakeUI='var __opendeskPageUIR243={createPageUI:function(){return {content:{},onDispose(){},addStyle(){},getMountDiagnostics(){return {}}}}};';
for(const [framework,path] of [
  ['react','examples/programs/page-ui-react/src/App.jsx'],
  ['vue','examples/programs/page-ui-vue/src/App.vue']
]){
  test('R24.3 pure browser preparation of '+framework+' is source data, never module execution',async()=>{
    const raw=await readFile(path,'utf8');
    globalThis.__moduleEvaluated=false;
    const result=await prepareBrowserPageComponent({componentSource:raw,
      framework,projectId:'sample.browser-'+framework,pageRules:rules,
      babel:Babel,transformSFC:transformVueSFC,uiHelperSource:fakeUI});
    assert.equal(globalThis.__moduleEvaluated,false);
    assert.equal(result.entry,'src/App.'+(framework==='react'?'jsx':'vue'));
    assert.ok(result.sourceUtf8.length<100000);
    assert.match(result.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
    assert.match(result.sourceUtf8,/async function main\(\)/);
    assert.match(result.sourceUtf8,/createPageUI/);
    assert.match(result.sourceUtf8,/\.unmount\(\)/);
    assert.ok(result.sourceMap.app);
    if(framework==='vue')assert.match(result.sourceUtf8,/data-v-/);
    new vm.Script(result.sourceUtf8);
  });
}
test('R24.3 browser transform refuses wrong runtime, missing export, eval and unlocked imports',async()=>{
  const cases=[
    {framework:'react',source:"import {ref} from 'vue';export default function App(){}"},
    {framework:'react',source:"export default function App(){return import('./evil.js')}"},
    {framework:'react',source:"import {useImaginaryHook} from 'react';export default function App(){}"},
    {framework:'react',source:"export default function App(){eval('1')}"},
    {framework:'vue',source:'<script setup>import x from "https://bad.example/x.js"</script><template><b>x</b></template>'}
  ];
  for(const row of cases)await assert.rejects(
    prepareBrowserPageComponent({componentSource:row.source,
      framework:row.framework,projectId:'sample.browser',pageRules:rules,
      babel:Babel,transformSFC:transformVueSFC,uiHelperSource:fakeUI}),
    error=>/^E_PAGE_/.test(error.code||''));
});
