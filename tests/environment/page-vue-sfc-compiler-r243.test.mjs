import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PAGE_VUE_COMPILER,PAGE_VUE_COMPILER_RESOURCE_LIMIT} from '../../src/libs/page-frameworks/vue-compiler-contract.js';
test('R24.3 Vue SFC compiler bytes are pinned to the separately locked upstream build',async()=>{
  const code=await readFile(PAGE_VUE_COMPILER.source);
  assert.equal(code.length,PAGE_VUE_COMPILER.bytes);
  assert.ok(code.length<PAGE_VUE_COMPILER_RESOURCE_LIMIT);
  assert.equal(createHash('sha256').update(code).digest('hex'),PAGE_VUE_COMPILER.sha256);
  assert.ok(PAGE_VUE_COMPILER.sourceLock.endsWith('page-ui-vue/package-lock.json'));
});
test('R24.3 prebuilt Vue compiler parses script setup, compiled template and scoped CSS without evaluating the component',async()=>{
  const compiler=await import('../../src/libs/page-frameworks/vue-sfc-compiler-3.5.22.mjs');
  for(const method of ['parse','compileScript','compileTemplate','compileStyle','rewriteDefault'])
    assert.equal(typeof compiler[method],'function');
  const source='<script setup>\nimport {ref} from "vue";\nconst n=ref(0);\n</script><template><button @click="n++">{{n}}</button></template><style scoped>button { padding:8px; }</style>';
  const parsed=compiler.parse(source,{filename:'src/App.vue'});
  assert.deepEqual(parsed.errors,[]);
  const id='data-v-r243test';
  const script=compiler.compileScript(parsed.descriptor,{id,inlineTemplate:false});
  assert.match(script.content,/export default/);
  const template=compiler.compileTemplate({source:parsed.descriptor.template.content,
    filename:'src/App.vue',id,scoped:true,compilerOptions:{bindingMetadata:script.bindings}});
  assert.deepEqual(template.errors,[]);
  assert.match(template.code,/from "vue"|from 'vue'/);
  const css=compiler.compileStyle({filename:'src/App.vue',id,scoped:true,
    source:parsed.descriptor.styles[0].content});
  assert.equal(css.errors.length,0);
  assert.match(css.code,/data-v-r243test/);
});
