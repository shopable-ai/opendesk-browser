// HTTPS / npm / relative are real static ESM imports.
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
import escape from 'lodash-es/escape.js';
import {getScores} from './lib/scores.js';

// axios: declared optional library; _ and dayjs: defaults.
// page is the authorized Controller Worker lexical proxy.
export default async function main() {
  const scores=getScores();
  const origin=new URL(await page.url()).origin;
  return {
    imports: {
      https: max(scores),
      npm: escape('A & B'),
      relative: scores
    },
    packaged: axios.getUri({
      baseURL: origin,
      url: '/demo-form.html',
      params: {mode: 'demo'}
    }),
    defaults: {
      words: _.words('OpenDesk Browser').length,
      date: dayjs('2026-10-14').format('YYYY-MM-DD')
    },
    pageTitle: await page.title()
  };
}
