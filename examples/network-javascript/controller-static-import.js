import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

// 侧栏选择“用于 Controller”，先准备、查看原文、批准，再单独运行 Controller。
// page/params 和默认库来自受控 Controller 环境，无需给 main 传参。
async function main() {
  return {
    largest: max([2, 8, 5]),
    title: await page.title(),
    params,
  };
}
