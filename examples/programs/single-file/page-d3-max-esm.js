import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';

export default async function main() {
  const value = max([2, 5, 3]);
  if (value !== 5) throw new Error('D3_IMPORT_FAILED');
  let node = document.getElementById('od-import-proof');
  if (!node) {
    node = document.createElement('output');
    node.id = 'od-import-proof';
    document.body.appendChild(node);
  }
  node.textContent = 'Page D3 max = ' + value;
  console.log('[IMPORT TEST][PAGE]', value);
  return {world: 'USER_SCRIPT', value, success: true};
}
