import {runCapture} from '../controller/capture.js';
import {Item} from '../engine/browser.js';
import {fields} from './configs.js';

// Original page-http.js Pipeline idiom, in the admitted Controller world.
export default async function main() {
  return runCapture({...fields,url:params.url??fields.url},page,{
    pipeline:item=>new Item({...item,name:item.name.toUpperCase()})
  });
}
