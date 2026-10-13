import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';

export default async function main() {
  const value = max([2, 5, 3]);
  if (value !== 5) throw new Error('D3_IMPORT_FAILED');
  console.log('[IMPORT TEST][CONTROLLER]', value);
  return {world: 'CONTROLLER', value, success: true, title: await page.title()};
}
