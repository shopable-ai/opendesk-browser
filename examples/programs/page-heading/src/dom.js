export function firstHeading(doc) {
  return doc.querySelector('h1')?.textContent?.trim() || '';
}
