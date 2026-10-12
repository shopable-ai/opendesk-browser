// @opendesk-import @vanillaes/csv https://raw.githubusercontent.com/vanillaes/csv/v4.1.3/src/index.js
import {parse} from '@vanillaes/csv';

export default async function main() {
  const rows = parse('name,price\nBook,18\nPen,3');
  const [, ...items] = rows;
  const title = await page.title();
  return {
    title,
    count: items.length,
    first: {name: items[0][0], price: items[0][1]},
    total: items.reduce((sum, row) => sum + Number(row[1]), 0)
  };
}
