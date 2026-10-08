import {readTitle} from './title.js';

export default async function main({page}) {
  return {title:await readTitle(page)};
}
