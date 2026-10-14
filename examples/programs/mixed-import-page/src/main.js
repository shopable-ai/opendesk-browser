// HTTPS / npm / relative are real static ESM imports.
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
import escape from 'lodash-es/escape.js';
import {getScores} from './lib/scores.js';

// query-string: declared optional library; _ and dayjs: defaults.
export default async function main() {
  const scores=getScores();
  return {
    imports: {
      https: max(scores),
      npm: escape('A & B'),
      relative: scores
    },
    packaged: queryString.parse('mode=demo').mode,
    defaults: {
      words: _.words('OpenDesk Browser').length,
      date: dayjs('2026-10-14').format('YYYY-MM-DD')
    },
    pageTitle: document.title
  };
}
