<script setup>
import {onMounted,ref} from 'vue';
const props=defineProps({request:{type:Function,required:true}});
const note=ref(''),busy=ref(true),status=ref('');
onMounted(async()=>{
  try{
    const data=await props.request('storage.get',{key:'note'});
    note.value=typeof data.value==='string'?data.value:'';
  }catch(error){status.value=String(error?.message||error);}
  finally{busy.value=false;}
});
async function save(){
  busy.value=true;status.value='正在保存…';
  try{await props.request('storage.set',{key:'note',value:note.value});status.value='已保存';}
  catch(error){status.value=String(error?.message||error);}
  finally{busy.value=false;}
}
</script>
<template>
  <main class="tool-app">
    <h1>Vue 笔记</h1>
    <p>构建成经典 IIFE；打开时只读取，保存需要点击按钮。</p>
    <label for="note">笔记</label>
    <textarea id="note" v-model="note" :disabled="busy" />
    <button type="button" :disabled="busy" @click="save">保存</button>
    <p role="status" aria-live="polite">{{ status }}</p>
  </main>
</template>
