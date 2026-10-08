import {normalizeKeyword} from './params.js';
import {searchFixture} from './search.js';

// Controller uses the approved Worker context from the existing build adapter.
export default async function main({page,params}) {
  const keyword = normalizeKeyword(params?.keyword);
  return {status:'CONTROLLER_DEMO_OK',keyword,...await searchFixture(page,keyword)};
}
