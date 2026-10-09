import {readSummary} from './extract.js';

export default async function main({page}) {
  return readSummary(page);
}
