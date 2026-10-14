import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

// 侧栏选择“用于网页 Page”，先准备、查看原文、批准，再单独点击网页试运行。
// document 属于目标网页的 USER_SCRIPT；这里没有 Controller page/params。
async function main() {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  return {title: document.title, headingCount: headings.length,
    deepestHeading: max(headings, node => Number(node.tagName.slice(1))) ?? 0};
}
