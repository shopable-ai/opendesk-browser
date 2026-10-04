<template>
  <div>
    <h4>todo6.com component</h4>
    <p @click="count++">public todo6.vue file</p>
    <p> show click <span> value: {{ count }} </span></p>
  </div>
</template>

<script lang="ts" setup name="todo-public">
import { ref } from 'vue';


const count = ref(0);
console.log('todo load run in');


</script>
