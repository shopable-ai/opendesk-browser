// Editable examples use the existing Controller / managed Page entry points.
const examples = Object.freeze({
  controller: `// 自动化示例：读取当前网页信息
async function main() {
  return { title: await page.title(), url: await page.url() };
}`,
  page: `// 网页示例：读取当前页面 DOM
async function main() {
  return {
    title: document.title,
    heading: document.querySelector('h1')?.textContent ?? ''
  };
}`,
  react: `import React, { useState } from 'react';
const max = values => Math.max(...values);

export default function App() {
  const [values, setValues] = useState([2, 5, 3]);
  return (
    <section>
      <h3>React 数据示例</h3>
      <p>数据：{values.join('、')}</p>
      <p>最大值：<strong>{max(values)}</strong></p>
      <button type="button" onClick={() => setValues(items => [...items, max(items) + 1])}>
        添加更大值
      </button>
      <button type="button" onClick={() => setValues([2, 5, 3])}>重置</button>
    </section>
  );
}`,
  vue: `<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>

<template>
  <button type="button" @click="count++">已点击 {{ count }} 次</button>
</template>`
});

export function createDeveloperStarterSource(view) {
  let lastExample = null;
  return {
    // Loaded/imported source belongs to its author, even if it equals an example.
    preserve() { lastExample = null; },
    fill(framework = 'javascript', world = 'controller') {
      const field = view.fields['script-source'];
      if (field.readOnly || (field.value.trim() && field.value !== lastExample)) return false;
      const source = examples[framework === 'javascript' ? world : framework];
      view.patch('script-source', {value: source});
      lastExample = source;
      return true;
    }
  };
}
