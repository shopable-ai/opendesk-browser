// Developer Edition Controller ESM; pinned external dependency, NOT a Page global.
import Papa from 'papaparse@5.7.0';

export default async function main() {
  const csv = Papa.unparse([
    {name: 'Book', price: 18},
    {name: 'Pen', price: 3}
  ], {columns: ['name', 'price'], newline: '\r\n', escapeFormulae: true});
  const result = Papa.parse(csv, {header: true, skipEmptyLines: true});
  if (result.errors.length) throw new Error('CSV parse failed');
  return {count: result.data.length, total: result.data.reduce((n, item) => n + Number(item.price), 0)};
}
