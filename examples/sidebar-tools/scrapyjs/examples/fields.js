import {runCapture} from '../controller/capture.js';
import {Item} from '../engine/browser.js';
import {fields} from './configs.js';

// Original ItemLoader field DSL (h1::text / a::href) stays inside extraction;
// it is not a Locator CSS expression. Pipeline runs in the Controller world.
export default async function main() {
  return runCapture({...fields,url:params.url??fields.url},page,{
    pipeline:item=>new Item({...item,name:item.name.toUpperCase()})
  });
}
