<script setup>
import {ref} from 'vue';
const count=ref(0);
</script>
<template>
  <button type="button" @click="count++">已点击 {{ count }} 次</button>
</template>
<style scoped>
button {padding:8px 14px;cursor:pointer}
</style>
