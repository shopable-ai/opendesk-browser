<script setup>
import {onMounted,ref} from 'vue';
const props=defineProps({onToggle:{type:Function,required:true}});
const message=ref('加载中…'),active=ref(false);
onMounted(()=>{message.value='已就绪';});
function act(){
  try{
    const result=props.onToggle();
    active.value=result.active;
    message.value=result.message;
  }catch(error){message.value='操作失败：'+String(error?.message||error);}
}
</script>
<template>
  <section class="r241-card" aria-label="OpenDesk Vue 网页工具">
    <strong>Vue 3 · 网页增强</strong>
    <p>仅修改标准测试段落；再次点击撤销。</p>
    <button type="button" @click="act">{{active?'撤销标记':'高亮段落'}}</button>
    <span role="status" aria-live="polite">{{message}}</span>
  </section>
</template>
