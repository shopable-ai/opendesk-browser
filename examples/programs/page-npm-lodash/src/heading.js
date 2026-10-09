import escape from 'lodash-es/escape.js';

export function describeHeading(doc) {
  const text=doc.querySelector('h1')?.textContent?.trim()||'';
  return {text,safeHtml:escape(text)};
}
