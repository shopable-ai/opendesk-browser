import test from 'node:test';
import assert from 'node:assert/strict';
import {transformVueSFC} from '../../src/libs/page-frameworks/vue-sfc-transform.js';
const app=`<script setup>
import {ref} from 'vue';
const count=ref(0);
</script>
<template><button type="button" @click="count++">已点击 {{ count }} 次</button></template>
<style scoped>button {padding:8px 14px;cursor:pointer}</style>`;
test('R24.3 official Vue script setup compiles to ESM render without executing user business code',async()=>{
  globalThis.__vueTopLevelExecuted=false;
  const r=await transformVueSFC({sourceUtf8:app+'\n',file:'src/App.vue',projectId:'sample.vue'});
  assert.match(r.code,/export default __odVueComponent/);
  assert.match(r.code,/__odVueComponent.render=render/);
  assert.match(r.code,/from ["']vue["']/);
  assert.match(r.code,/__scopeId=/);
  assert.match(r.css,/button\[data-v-/);
  assert.equal(globalThis.__vueTopLevelExecuted,false);
  assert.deepEqual(r,await transformVueSFC({sourceUtf8:app+'\n',file:'src/App.vue',projectId:'sample.vue'}));
});
test('R24.3 Vue Options API script/template and scoped styles remain supported',async()=>{
  const source='<script>export default {data(){return {count:0}}}</script>'+
    '<template><button @click="count++">{{count}}</button></template><style scoped>button{color:blue}</style>';
  const result=await transformVueSFC({sourceUtf8:source,file:'src/Options.vue',projectId:'test.vue'});
  assert.match(result.code,/__odVueComponent.render=render/);
  assert.match(result.css,/data-v-/);
});
test('R24.3 Vue compiler refuses remote blocks, TS preprocessors and CSS imports before execution',async()=>{
  for(const source of [
    '<script src="https://example.test/user.js"></script><template><p>x</p></template>',
    '<script setup lang="ts">const x:number=1</script><template><p>x</p></template>',
    '<template><p>x</p></template><style scoped>@import url(https://example.test/x.css)</style>'
  ])await assert.rejects(transformVueSFC({sourceUtf8:source,file:'src/App.vue',projectId:'test.vue'}),
    e=>e.code?.startsWith('E_PAGE_VUE_'));
});
