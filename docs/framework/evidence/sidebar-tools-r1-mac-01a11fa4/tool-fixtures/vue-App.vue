<script setup>import {ref} from 'vue';const count=ref(0);</script>
<template><main class="vue-tool"><h1>Vue 中文工具</h1><button id="vue-count" @click="count++">计数 {{count}}</button></main></template>