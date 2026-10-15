// @opendesk-lib papa-parse
// Page USER_SCRIPT (Standard/Developer), not Controller or website MAIN.
async function main() {
  const products = [
    {name: 'Book', price: 18},
    {name: 'Pen', price: 3},
    {name: '苹果, "Pro"', price: 5},
    {name: '=1+2', price: 0}
  ];
  const csv = Papa.unparse(products, {
    columns: ['name', 'price'],
    newline: '\r\n',
    escapeFormulae: true
  });
  const parsed = Papa.parse(csv, {header: true, skipEmptyLines: true});
  if (parsed.errors.length) throw new Error('CSV parse failed');
  return {csv, count: parsed.data.length, first: parsed.data[0]};
}
