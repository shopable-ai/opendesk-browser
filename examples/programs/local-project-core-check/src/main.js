import {version} from './version.js';

export default async function main() {
  const title = await page.title();
  const heading = await page.locator('h1').textContent();
  if (params.waitMs) await new Promise(resolve => setTimeout(resolve, params.waitMs));
  return {message: `本地项目核心测试 ${version}`, title, heading};
}
